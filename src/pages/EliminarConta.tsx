import React from 'react';

export default function EliminarConta() {
  return (
    <div className="min-h-screen bg-white text-gray-900 px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">
          Eliminação de Conta – Gobi & Júnior
        </h1>

        <p className="mb-4">
          Se deseja solicitar a eliminação da sua conta e dos dados associados
          à app Gobi & Júnior, envie um email para:
        </p>

        <p className="mb-4 font-semibold">suporte@gobijunior.pt</p>

        <p className="mb-4">
          com o assunto: <strong>Pedido de eliminação de conta</strong>
        </p>

        <p className="mb-6">
          O pedido será analisado e a conta será eliminada em até{' '}
          <strong>7 dias úteis</strong>.
        </p>

        <h2 className="text-xl font-semibold mb-3">Dados eliminados</h2>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>Conta do utilizador</li>
          <li>Email associado</li>
          <li>Dados de perfil</li>
          <li>Registos associados ao utilizador, quando aplicável</li>
        </ul>

        <h2 className="text-xl font-semibold mb-3">Dados que podem ser mantidos</h2>
        <p className="mb-4">
          Alguns dados poderão ser mantidos temporariamente quando houver
          obrigação legal, fiscal, administrativa ou de segurança.
        </p>

        <h2 className="text-xl font-semibold mb-3">Contacto</h2>
        <p>
          Para qualquer questão relacionada com privacidade ou eliminação de
          conta, contacte: <strong>suporte@gobijunior.pt</strong>
        </p>
      </div>
    </div>
  );
}