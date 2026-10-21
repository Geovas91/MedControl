import { createRoot } from 'react-dom/client';
import { AppointmentAssistant } from '../../components/bot/appointment-assistant';
import { ids, seedAppointment, state, today } from './boundaries';

export const harness = {
  state, ids, seedAppointment,
  snapshot: () => ({ ...state, pending: [...state.pending.values()] })
};
declare global { interface Window { assistantQa: typeof harness } }
window.assistantQa = harness;
createRoot(document.getElementById('root')!).render(<AppointmentAssistant today={today} timeZone="America/Mexico_City" llmEnabled={false} />);
