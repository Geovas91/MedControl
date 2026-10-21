import { createRoot } from 'react-dom/client';
import { AppointmentAssistant } from '../../components/bot/appointment-assistant';
import { executeConfirmedAssistantAction, ids, seedAppointment, state, today } from './boundaries';
import { CreatePatientForm } from '../../components/patients/create-patient-form';
import { EditPatientForm } from '../../components/patients/edit-patient-form';

// Synthetic test state only, surviving full browser navigation in the shared
// lifecycle driver. Playwright destroys this fresh context after each test.
const saved = sessionStorage.getItem('isolated-assistant-qa');
if (saved) {
  const restored = JSON.parse(saved);
  Object.assign(state, restored, { pending: new Map(restored.pending) });
}
addEventListener('pagehide', () => sessionStorage.setItem('isolated-assistant-qa', JSON.stringify({ ...state, pending: [...state.pending] })));

export const harness = {
  state, ids, seedAppointment, confirmAgain: executeConfirmedAssistantAction,
  snapshot: () => ({ ...state, pending: [...state.pending.values()] })
};
declare global { interface Window { assistantQa: typeof harness } }
window.assistantQa = harness;
const path = location.pathname;
const patient = state.fixturePatient;
const view = path === '/dashboard/patients/new' ? <CreatePatientForm doctors={[]} clinicToday={today} />
  : path.endsWith('/edit') && patient ? <EditPatientForm patientId={patient.id} clinicToday={today} doctors={[]} initialValues={{ firstNames: 'QAauto', paternalSurname: patient.name.slice(7), maternalSurname: '', dateOfBirth: '1990-01-01', sex: 'unspecified', status: patient.status, phone: patient.phone, email: '', genderIdentity: '', address: '', maritalStatus: '', occupation: '', educationLevel: '', primaryDoctorId: '', emergencyContactName: 'Contacto QA', emergencyContactRelationship: 'QA', emergencyContactPhone: patient.phone, flowIntent: 'later' }} />
  : path.startsWith('/dashboard/patients/') ? <h1>QA fixture saved</h1>
  : <AppointmentAssistant today={today} timeZone="America/Mexico_City" llmEnabled={false} />;
createRoot(document.getElementById('root')!).render(view);
