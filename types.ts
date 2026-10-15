import type { SedeId } from './config/sedes';

export interface User {
  id: string;          // Código de boleto: VDA-XXXXXX (Acapulco) o VDQ-XXXXXX (Querétaro)
  name: string;
  email: string;
  specialty?: string;
  sede: SedeId;
  checkedIn?: boolean;
}

export enum AppState {
  SELECT_SEDE,
  REGISTERING,
  CONFIRMED,
  CLOSED,
  ADMIN_LOGIN,
  ADMIN_SCANNER,
}
