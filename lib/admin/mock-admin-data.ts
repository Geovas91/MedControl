export const adminStats = [
  {
    label: "Clínicas registradas",
    value: "128",
    detail: "12 nuevas durante este mes"
  },
  {
    label: "Médicos registrados",
    value: "342",
    detail: "276 cuentas activas"
  },
  {
    label: "Suscripciones activas",
    value: "94",
    detail: "18 planes Clinic"
  },
  {
    label: "Pagos pendientes",
    value: "$18,420",
    detail: "7 facturas requieren seguimiento"
  },
  {
    label: "Alertas administrativas",
    value: "5",
    detail: "Revisar verificaciones y soporte"
  }
];

export const adminClinics = [
  {
    name: "Clínica Norte Demo",
    plan: "Clinic",
    status: "Activa",
    doctors: 8,
    createdAt: "2026-05-12"
  },
  {
    name: "Consultorio Vida Demo",
    plan: "Professional",
    status: "En revisión",
    doctors: 3,
    createdAt: "2026-05-20"
  },
  {
    name: "Centro Salud Sur Demo",
    plan: "Initial",
    status: "Pendiente",
    doctors: 1,
    createdAt: "2026-06-01"
  }
];

export const adminDoctors = [
  {
    name: "Dra. Elena Demo",
    email: "elena.demo@clinicontrol.local",
    clinic: "Clínica Norte Demo",
    role: "Owner",
    status: "Activo"
  },
  {
    name: "Dr. Mateo Demo",
    email: "mateo.demo@clinicontrol.local",
    clinic: "Consultorio Vida Demo",
    role: "Doctor",
    status: "Invitado"
  },
  {
    name: "Dra. Sofía Demo",
    email: "sofia.demo@clinicontrol.local",
    clinic: "Centro Salud Sur Demo",
    role: "Admin",
    status: "En revisión"
  }
];

export const adminSubscriptions = [
  {
    clinic: "Clínica Norte Demo",
    plan: "Clinic",
    status: "Activa",
    nextCharge: "2026-07-01",
    paymentMethod: "Tarjeta terminación 4242"
  },
  {
    clinic: "Consultorio Vida Demo",
    plan: "Professional",
    status: "Pago pendiente",
    nextCharge: "2026-06-12",
    paymentMethod: "Transferencia"
  },
  {
    clinic: "Centro Salud Sur Demo",
    plan: "Initial",
    status: "Prueba",
    nextCharge: "2026-06-20",
    paymentMethod: "Sin método registrado"
  }
];
