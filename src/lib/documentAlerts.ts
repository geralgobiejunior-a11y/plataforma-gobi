import { supabase } from './supabase';
import { createNotification } from './notifications';

interface DocumentoVencido {
  id: string;
  tipo_documento_nome: string;
  data_validade: string;
  entidade_tipo: string;
  entidade_nome: string;
}

export async function checkAndNotifyExpiredDocuments(userId: string) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const em30Dias = new Date(hoje);
  em30Dias.setDate(em30Dias.getDate() + 30);

  const { data: documentos, error } = await supabase
    .from('documentos')
    .select(`
      id,
      data_validade,
      entidade_tipo,
      entidade_id,
      tipo_documento_id,
      tipos_documento!inner(nome)
    `)
    .not('data_validade', 'is', null);

  if (error) {
    console.error('Erro ao verificar documentos:', error);
    return;
  }

  if (!documentos) return;

  const vencidos: DocumentoVencido[] = [];
  const aVencer: DocumentoVencido[] = [];

  for (const doc of documentos) {
    const dataValidade = new Date(doc.data_validade);

    if (isNaN(dataValidade.getTime())) continue;

    let entidadeNome = 'Entidade desconhecida';

    if (doc.entidade_id) {
      if (doc.entidade_tipo === 'colaborador') {
        const { data: colab } = await supabase
          .from('colaboradores')
          .select('nome_completo')
          .eq('id', doc.entidade_id)
          .maybeSingle();

        if (colab) entidadeNome = colab.nome_completo;
      } else if (doc.entidade_tipo === 'empresa') {
        const { data: emp } = await supabase
          .from('empresas')
          .select('nome')
          .eq('id', doc.entidade_id)
          .maybeSingle();

        if (emp) entidadeNome = emp.nome;
      }
    }

    const docInfo: DocumentoVencido = {
      id: doc.id,
      tipo_documento_nome: (doc.tipos_documento as any)?.nome || 'Documento',
      data_validade: doc.data_validade,
      entidade_tipo: doc.entidade_tipo,
      entidade_nome: entidadeNome,
    };

    if (dataValidade < hoje) {
      vencidos.push(docInfo);
    } else if (dataValidade <= em30Dias) {
      aVencer.push(docInfo);
    }
  }

  const { data: notificacoesExistentes } = await supabase
    .from('notificacoes')
    .select('mensagem')
    .eq('user_id', userId)
    .eq('tipo', 'documento')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const mensagensExistentes = new Set(
    (notificacoesExistentes || []).map((n) => n.mensagem)
  );

  for (const doc of vencidos) {
    const mensagem = `O documento "${doc.tipo_documento_nome}" de ${doc.entidade_nome} está vencido desde ${new Date(doc.data_validade).toLocaleDateString('pt-PT')}.`;

    if (!mensagensExistentes.has(mensagem)) {
      await createNotification(
        userId,
        'alerta',
        'Documento vencido',
        mensagem
      );
    }
  }

  for (const doc of aVencer) {
    const diasRestantes = Math.ceil(
      (new Date(doc.data_validade).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
    );

    const mensagem = `O documento "${doc.tipo_documento_nome}" de ${doc.entidade_nome} vence em ${diasRestantes} dia(s).`;

    if (!mensagensExistentes.has(mensagem)) {
      await createNotification(
        userId,
        'documento',
        'Documento a vencer',
        mensagem
      );
    }
  }

  return {
    vencidos: vencidos.length,
    aVencer: aVencer.length,
  };
}
