export interface GoalMetric {
  meta_total: number;
  realizado: number;
  atingimento_pct: number;
  diferenca: number;
  projecao: number;
  status?: 'ATINGIDA' | 'PARCIAL' | 'NAO_ATINGIDA';
}

export interface GeneralGoal extends GoalMetric {
  projecao_atingimento_pct: number;
  dias_uteis: number;
  media_diaria: number;
  meta_diaria: number;
  dias_restantes: number;
}

export interface SellerGoal extends GoalMetric {
  vendedor_id: number;
  nome: string;
}

export interface BrandGoal extends GoalMetric {
  marca: string;
}

export interface GroupGoal extends GoalMetric {
  grupo: string;
}

export interface GoalsResponse {
  meta_geral: GeneralGoal;
  metas_por_vendedor: SellerGoal[];
  metas_por_marca: BrandGoal[];
  metas_por_grupo: GroupGoal[];
}
