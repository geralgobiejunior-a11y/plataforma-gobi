export type Scope = 'colaborador' | 'empresa';

export type StatusFilter =
  | 'todos'
  | 'sem_documento'
  | 'vencido'
  | 'a_vencer'
  | 'valido'
  | 'sem_validade';

export type DocStatus =
  | 'sem_documento'
  | 'vencido'
  | 'a_vencer'
  | 'valido'
  | 'sem_validade';

export type EntidadeTipo = 'colaborador' | 'empresa';

export type DocumentosInitialSelection = {
  scope: Scope;
  entidadeId: string;
  entidadeNome?: string | null;
};

export type DocsFocusPayload = {
  tipo: EntidadeTipo;
  id: string;
  nome?: string | null;
};

export interface Documento {
  id: string;
  entidade_tipo: string;
  entidade_id: string;
  entidade_nome: string | null;

  nome: string | null;
  tipo: string | null;

  arquivo_url: string | null;
  data_validade: string | null;

  tipo_documento_id: string | null;
  tipos_documento: { nome: string } | null;
}

export interface TipoDocumento {
  id: string;
  nome: string;
}

export interface ColaboradorRow {
  id: string;
  nome_completo: string;
  email: string | null;
  telefone: string | null;
  status: string | null;
  categoria: string | null;
  foto_url: string | null;
}

export interface EmpresaRow {
  id: string;
  nome?: string | null;
  razao_social?: string | null;
  logo_url?: string | null;
}

export type EntityDocStats = {
  total: number;
  sem_documento: number;
  vencido: number;
  a_vencer: number;
  valido: number;
  sem_validade: number;
};

export type LockEntidade = {
  tipo: EntidadeTipo;
  id: string;
  nome?: string | null;
} | null;