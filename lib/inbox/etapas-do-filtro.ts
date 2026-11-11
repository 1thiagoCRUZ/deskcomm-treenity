/**
 * O formato que `GET /api/v1/conversations/etapas` devolve e o filtro "Etapa" do Inbox
 * lê. Um arquivo só para a rota e o hook não divergirem.
 */
export interface EtapaDoFiltro {
  id: string;
  name: string;
  /** `#RRGGBB` ou `null` (a etapa não tem cor). */
  color: string | null;
  is_won: boolean;
  is_lost: boolean;
}

export interface FunilDoFiltro {
  id: string;
  name: string;
  is_default: boolean;
  etapas: EtapaDoFiltro[];
}
