export const anamnesisQuestions = [
  { codigo: 'alergia', pergunta: 'Possui alergia?', detalheObrigatorio: true, alerta: true, resumoAlerta: 'Alergia' },
  { codigo: 'medicamento_continuo', pergunta: 'Usa medicamento contínuo?', detalheObrigatorio: true, alerta: true, resumoAlerta: 'Medicamento contínuo' },
  { codigo: 'diabetes', pergunta: 'Possui diabetes?', detalheObrigatorio: false, alerta: true, resumoAlerta: 'Diabetes' },
  { codigo: 'hipertensao', pergunta: 'Possui hipertensão?', detalheObrigatorio: false, alerta: true, resumoAlerta: 'Hipertensão' },
  { codigo: 'doenca_cardiaca', pergunta: 'Possui doença cardíaca?', detalheObrigatorio: false, alerta: true, resumoAlerta: 'Doença cardíaca' },
  { codigo: 'coagulacao', pergunta: 'Possui problema de coagulação?', detalheObrigatorio: false, alerta: true, resumoAlerta: 'Problema de coagulação' },
  { codigo: 'gravidez_amamentacao', pergunta: 'Está grávida ou amamentando?', detalheObrigatorio: false, alerta: true, resumoAlerta: 'Gravidez ou amamentação' },
  { codigo: 'reacao_anestesia', pergunta: 'Já teve reação à anestesia?', detalheObrigatorio: true, alerta: true, resumoAlerta: 'Reação à anestesia' },
  { codigo: 'cirurgia_recente', pergunta: 'Realizou cirurgia recentemente?', detalheObrigatorio: false, alerta: true, resumoAlerta: 'Cirurgia recente' },
  { codigo: 'doenca_infectocontagiosa', pergunta: 'Possui doença infectocontagiosa?', detalheObrigatorio: false, alerta: true, resumoAlerta: 'Doença infectocontagiosa' },
  { codigo: 'fumante', pergunta: 'É fumante?', detalheObrigatorio: false, alerta: true, resumoAlerta: 'Fumante' },
  { codigo: 'outra_condicao', pergunta: 'Possui outra condição relevante?', detalheObrigatorio: true, alerta: true, resumoAlerta: 'Outra condição relevante' },
] as const;

export const anamnesisAlertLabels = Object.fromEntries(
  anamnesisQuestions.map((question) => [question.codigo, question.resumoAlerta]),
) as Record<string, string>;

