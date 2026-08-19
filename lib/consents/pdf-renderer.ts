import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";

export const CONSENT_PDF_RENDERER_VERSION = "consent-pdf-v1";

export type SignedConsentPdfEvidence = {
  snapshotId: string;
  documentId: string;
  clinicName: string;
  clinicTimezone: string;
  patientDisplayName: string;
  consentId: string;
  consentType: string;
  consentVersion: string;
  consentText: string;
  issuedAt: string;
  signerFullName: string;
  acceptedPrivacyNotice: boolean;
  acceptedSensitiveDataProcessing: boolean;
  signedAt: string;
  signatureData: string;
  rendererVersion: string;
};

export function getSignedConsentPdfText(evidence: SignedConsentPdfEvidence) {
  return {
    title: "Consentimiento informado",
    status: "Estado: Firmado",
    consentId: `ID del consentimiento: ${evidence.consentId}`,
    documentId: `Identificador documental: ${evidence.documentId}`,
    type: `Tipo: ${evidence.consentType}`,
    version: `Versión: ${evidence.consentVersion}`,
    patient: `Paciente: ${evidence.patientDisplayName}`,
    issuedAt: `Fecha de emisión: ${formatDate(evidence.issuedAt, evidence.clinicTimezone)}`,
    signedAt: `Fecha y hora de firma: ${formatDate(evidence.signedAt, evidence.clinicTimezone)}`,
    consentText: evidence.consentText,
    signer: `Firmante: ${evidence.signerFullName}`,
    privacy: `Aviso de privacidad: ${evidence.acceptedPrivacyNotice ? "Aceptado" : "No aceptado"}`,
    sensitiveData: `Tratamiento de datos sensibles: ${evidence.acceptedSensitiveDataProcessing ? "Aceptado" : "No aceptado"}`,
    legend: "Documento electrónico generado por CliniControl a partir de evidencia digital inmutable asociada al consentimiento firmado.",
    renderer: `Renderer: ${evidence.rendererVersion}`
  };
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const BODY_SIZE = 10.5;
const BODY_LINE_HEIGHT = 15;

function splitLongWord(word: string, font: PDFFont, size: number, maxWidth: number) {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of Array.from(word)) {
    if (chunk && font.widthOfTextAtSize(chunk + character, size) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk += character;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/u).flatMap((word) =>
      font.widthOfTextAtSize(word, size) <= maxWidth ? [word] : splitLongWord(word, font, size, maxWidth)
    );
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function decodeSignaturePng(signatureData: string) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(signatureData);
  if (!match) throw new Error("invalid_signature_png");
  return Buffer.from(match[1], "base64");
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone
  }).format(new Date(value));
}

export async function renderSignedConsentPdf(evidence: SignedConsentPdfEvidence, fontBytes: Uint8Array) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle("Consentimiento informado");
  pdf.setAuthor("CliniControl");
  pdf.setCreator(`CliniControl ${evidence.rendererVersion}`);
  pdf.setProducer(`CliniControl ${evidence.rendererVersion}`);
  pdf.setCreationDate(new Date(evidence.signedAt));
  pdf.setModificationDate(new Date(evidence.signedAt));

  const font = await pdf.embedFont(fontBytes, { subset: true });
  const signature = await pdf.embedPng(decodeSignaturePng(evidence.signatureData));
  const text = getSignedConsentPdfText(evidence);
  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (height: number) => {
    if (y - height >= MARGIN + 24) return;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    y = PAGE_HEIGHT - MARGIN;
  };

  const drawLine = (value: string, size = BODY_SIZE, color = rgb(0.15, 0.2, 0.26), gap = BODY_LINE_HEIGHT) => {
    ensureSpace(gap);
    page.drawText(value, { x: MARGIN, y, size, font, color });
    y -= gap;
  };

  const drawWrapped = (value: string, size = BODY_SIZE, lineHeight = BODY_LINE_HEIGHT) => {
    const paragraphs = value.replace(/\r\n/g, "\n").split("\n");
    for (const paragraph of paragraphs) {
      const lines = wrapPdfText(paragraph, font, size, PAGE_WIDTH - MARGIN * 2);
      const paragraphHeight = Math.max(1, lines.length) * lineHeight;
      if (paragraphHeight <= PAGE_HEIGHT - MARGIN * 2 - 24) ensureSpace(paragraphHeight);
      for (const line of lines) {
        drawLine(line || " ", size, rgb(0.15, 0.2, 0.26), lineHeight);
      }
    }
  };

  drawLine(evidence.clinicName, 11, rgb(0.04, 0.42, 0.45), 20);
  drawLine(text.title, 21, rgb(0.06, 0.13, 0.2), 30);
  drawLine(text.status, 11, rgb(0.05, 0.5, 0.3), 24);
  drawLine(text.consentId);
  drawLine(text.documentId);
  drawLine(text.type);
  drawLine(text.version);
  drawLine(text.patient);
  drawLine(text.issuedAt);
  drawLine(text.signedAt, BODY_SIZE, rgb(0.15, 0.2, 0.26), 24);

  drawLine("Texto firmado", 14, rgb(0.06, 0.13, 0.2), 22);
  drawWrapped(text.consentText);
  y -= 8;
  drawLine("Evidencia de aceptación", 14, rgb(0.06, 0.13, 0.2), 22);
  drawLine(text.signer);
  drawLine(text.privacy);
  drawLine(text.sensitiveData, BODY_SIZE, rgb(0.15, 0.2, 0.26), 22);

  ensureSpace(145);
  drawLine("Firma gráfica", 14, rgb(0.06, 0.13, 0.2), 22);
  const signatureBoxWidth = 300;
  const signatureBoxHeight = 100;
  page.drawRectangle({ x: MARGIN, y: y - signatureBoxHeight, width: signatureBoxWidth, height: signatureBoxHeight, borderColor: rgb(0.75, 0.8, 0.84), borderWidth: 1 });
  drawContainedImage(page, signature, MARGIN + 8, y - signatureBoxHeight + 8, signatureBoxWidth - 16, signatureBoxHeight - 16);
  y -= signatureBoxHeight + 24;

  drawWrapped(text.legend, 9.5, 14);
  drawLine(text.renderer, 8.5, rgb(0.4, 0.45, 0.5), 12);

  pages.forEach((currentPage, index) => {
    currentPage.drawText(`Página ${index + 1} de ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 70,
      y: 24,
      size: 8,
      font,
      color: rgb(0.45, 0.49, 0.54)
    });
  });

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function drawContainedImage(page: PDFPage, image: PDFImage, x: number, y: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: x + (maxWidth - width) / 2, y: y + (maxHeight - height) / 2, width, height });
}
