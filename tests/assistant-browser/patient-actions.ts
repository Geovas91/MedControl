import { state } from './boundaries';
import type { PatientFormState } from '../../lib/patients/create';

export async function createPatientAction(_prior: PatientFormState, form: FormData): Promise<PatientFormState> {
  state.fixturePatient = { id: '77777777-7777-4777-8777-777777777777', name: `${form.get('first_names')} ${form.get('paternal_surname')}`, status: 'active', createdAt: new Date().toISOString(), phone: String(form.get('phone')) };
  window.location.assign(`/dashboard/patients/${state.fixturePatient.id}?created=1`);
  return {};
}
export async function updatePatientAction(_id: string, _prior: PatientFormState, form: FormData): Promise<PatientFormState> {
  if (!state.fixturePatient || !state.authenticated) return { error: 'Unavailable QA fixture' };
  state.fixturePatient.status = String(form.get('status'));
  window.location.assign(`/dashboard/patients/${state.fixturePatient.id}?updated=1`);
  return {};
}
