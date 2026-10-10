/**
 * DADOS PARA NOTA E ENVIO do contato — o que a loja pede ao cliente no
 * fechamento da venda (pedido do Dono da Top Ultra, reunião de 02/10).
 *
 * Duas partes, como na mensagem que o Dono já mandava à mão:
 *   - do comprador (obrigatórios para emitir e despachar): nome, CPF,
 *     telefone, e-mail, CEP urbano de entrega, endereço, cidade, estado;
 *   - da propriedade (opcionais, "caso queira na nota"): nome/razão social,
 *     CNPJ, IE, CEP, endereço.
 *
 * Quem preenche: o bot, no fechamento (`/api/treenity-bot/whatsapp/dados-do-cliente`),
 * ou a equipe, na tela do contato. Na compra seguinte o bot só CONFIRMA — por
 * isso existe `resumoParaOBot`, que nunca devolve o CPF.
 *
 * O CPF é cifrado AQUI (AES-256-GCM) e não no banco: a função `encrypt_cpf`
 * que `lib/contacts/cpf.ts` chama não existe no baseline, então o caminho
 * antigo só guardava o hash — e a nota precisa do número. A chave é derivada
 * de `CPF_ENCRYPTION_KEY` (obrigatória em produção). ⚠️ Trocar essa variável
 * torna ilegíveis os CPFs já gravados.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { env } from "@/lib/env";
import { isValidCpf } from "@/lib/schemas/contacts";
import { logger } from "@/lib/logger";
import {
  CAMPOS_OBRIGATORIOS,
  ROTULO_DO_CAMPO,
  type CampoObrigatorio,
  type DadosDeNotaParaTela,
} from "./dados-de-nota-tipos";

export { CAMPOS_OBRIGATORIOS, ROTULO_DO_CAMPO, type CampoObrigatorio, type DadosDeNotaParaTela };

// ---------------------------------------------------------------------------
// Forma
// ---------------------------------------------------------------------------

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const soDigitos = (v: string) => v.replace(/\D/g, "");

/** Nome do estado (sem acento, minúsculo) → sigla. O cliente escreve "São Paulo". */
const UF_POR_NOME: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
  paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

export function siglaDoEstado(valor: string): string {
  const limpo = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return UF_POR_NOME[limpo] ?? valor.trim().toUpperCase();
}

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

/**
 * O que se pode gravar. Tudo opcional: o bot manda o que o cliente respondeu,
 * a equipe corrige um campo. Campo AUSENTE não mexe no que está gravado; campo
 * vazio (`""`/`null`) apaga.
 */
export const dadosDeNotaEntradaSchema = z.object({
  nome: texto(160),
  cpf: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : soDigitos(v)))
    .nullable()
    .optional()
    .refine((v) => v == null || isValidCpf(v), { message: "CPF inválido." }),
  telefone: texto(40)
    .transform((v) => (v == null ? v : soDigitos(v) || null))
    .optional(),
  email: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.toLowerCase()))
    .nullable()
    .optional()
    .refine((v) => v == null || z.string().email().safeParse(v).success, { message: "E-mail inválido." }),
  cep: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : soDigitos(v)))
    .nullable()
    .optional()
    .refine((v) => v == null || v.length === 8, { message: "CEP precisa ter 8 dígitos." }),
  endereco: texto(300),
  cidade: texto(120),
  estado: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : siglaDoEstado(v)))
    .nullable()
    .optional()
    .refine((v) => v == null || UFS.has(v), { message: "Estado não reconhecido (ex.: SP ou São Paulo)." }),
  propriedade_nome: texto(200),
  propriedade_cnpj: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : soDigitos(v)))
    .nullable()
    .optional()
    .refine((v) => v == null || v.length === 14, { message: "CNPJ precisa ter 14 dígitos." }),
  propriedade_ie: texto(40),
  propriedade_cep: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : soDigitos(v)))
    .nullable()
    .optional()
    .refine((v) => v == null || v.length === 8, { message: "CEP da propriedade precisa ter 8 dígitos." }),
  propriedade_endereco: texto(300),
  /** A transportadora que ele escolheu (ex.: "Sedex"). O VALOR do frete não se guarda: muda a cada pedido. */
  transportadora_preferida: texto(60),
});

export type DadosDeNotaEntrada = z.infer<typeof dadosDeNotaEntradaSchema>;

/** A linha como está no banco. */
export interface LinhaDadosDeNota {
  id: string;
  organization_id: string;
  contact_id: string;
  nome: string | null;
  cpf_cifrado: string | null;
  cpf_final: string | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  propriedade_nome: string | null;
  propriedade_cnpj: string | null;
  propriedade_ie: string | null;
  propriedade_cep: string | null;
  propriedade_endereco: string | null;
  transportadora_preferida: string | null;
  preenchido_por: "bot" | "equipe";
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Cifra do CPF
// ---------------------------------------------------------------------------

function chave(): Buffer {
  const raw = env.CPF_ENCRYPTION_KEY;
  if (!raw) throw new Error("CPF_ENCRYPTION_KEY não configurada — o CPF não pode ser gravado.");
  // Derivada por SHA-256 para valer com qualquer formato que a instalação tenha
  // posto na variável (hex, base64 ou frase): sempre 32 bytes.
  return createHash("sha256").update(raw, "utf8").digest();
}

/** `iv.tag.cifrado`, em base64. */
export function cifrarCpf(cpf: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const cifrado = Buffer.concat([c.update(soDigitos(cpf), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), cifrado].map((b) => b.toString("base64")).join(".");
}

/** `null` quando não dá para decifrar (chave trocada, valor corrompido). */
export function decifrarCpf(guardado: string): string | null {
  try {
    const [iv, tag, cifrado] = guardado.split(".").map((p) => Buffer.from(p, "base64"));
    if (!iv || !tag || !cifrado) return null;
    const d = createDecipheriv("aes-256-gcm", chave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(cifrado), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function mascararCpf(final: string | null): string | null {
  return final ? `***.***.***-${final}` : null;
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

export function camposFaltando(linha: LinhaDadosDeNota | null): CampoObrigatorio[] {
  if (!linha) return [...CAMPOS_OBRIGATORIOS];
  return CAMPOS_OBRIGATORIOS.filter((campo) =>
    campo === "cpf" ? !linha.cpf_cifrado : !linha[campo],
  );
}

export function paraTela(linha: LinhaDadosDeNota, revelarCpf = false): DadosDeNotaParaTela {
  return {
    nome: linha.nome,
    cpf_mascarado: mascararCpf(linha.cpf_final),
    ...(revelarCpf ? { cpf: linha.cpf_cifrado ? decifrarCpf(linha.cpf_cifrado) : null } : {}),
    telefone: linha.telefone,
    email: linha.email,
    cep: linha.cep,
    endereco: linha.endereco,
    cidade: linha.cidade,
    estado: linha.estado,
    propriedade_nome: linha.propriedade_nome,
    propriedade_cnpj: linha.propriedade_cnpj,
    propriedade_ie: linha.propriedade_ie,
    propriedade_cep: linha.propriedade_cep,
    propriedade_endereco: linha.propriedade_endereco,
    transportadora_preferida: linha.transportadora_preferida,
    preenchido_por: linha.preenchido_por,
    atualizado_em: linha.updated_at,
    faltando: camposFaltando(linha),
  };
}

export function mascararTelefone(tel: string | null): string | null {
  if (!tel) return null;
  const d = soDigitos(tel).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length < 8) return "*****";
  const ddd = d.length >= 10 ? `(${d.slice(0, 2)}) ` : "";
  return `${ddd}*****-${d.slice(-4)}`;
}

export function mascararEmail(email: string | null): string | null {
  if (!email) return null;
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return "*****";
  return `${usuario.slice(0, 1)}*****@${dominio}`;
}

export function mascararCnpj(cnpj: string | null): string | null {
  return cnpj && cnpj.length === 14 ? `**.***.***/****-${cnpj.slice(-2)}` : cnpj ? "*****" : null;
}

const cepFormatado = (cep: string) => (cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep);

/**
 * O que o BOT recebe na compra seguinte, para o cliente CONFERIR de olho e só
 * responder "sim" (sugestão do usuário, 08/10). O que identifica a pessoa vai
 * MASCARADO — CPF, telefone, e-mail, CNPJ —, porque a mensagem fica no celular
 * dele e pode ser vista por outra pessoa. O endereço vai inteiro: é o que ele
 * precisa conferir, e o que mais muda. `cep` vai em dígitos para o bot
 * recalcular o frete (o valor muda a cada pedido; só a transportadora se repete).
 */
export function resumoParaOBot(linha: LinhaDadosDeNota | null): {
  tem_dados: boolean;
  faltando: string[];
  dados_mascarados: string | null;
  cep: string | null;
  transportadora_preferida: string | null;
  tem_propriedade: boolean;
} {
  if (!linha) {
    return {
      tem_dados: false,
      faltando: CAMPOS_OBRIGATORIOS.map((c) => ROTULO_DO_CAMPO[c]),
      dados_mascarados: null,
      cep: null,
      transportadora_preferida: null,
      tem_propriedade: false,
    };
  }
  const entrega = [
    linha.endereco,
    linha.cidade && linha.estado ? `${linha.cidade}/${linha.estado}` : (linha.cidade ?? linha.estado),
    linha.cep ? `CEP ${cepFormatado(linha.cep)}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const temPropriedade = Boolean(linha.propriedade_nome || linha.propriedade_cnpj);
  const linhas = [
    linha.nome ? `Nome: ${linha.nome}` : null,
    linha.cpf_final ? `CPF: ${mascararCpf(linha.cpf_final)}` : null,
    linha.telefone ? `Telefone: ${mascararTelefone(linha.telefone)}` : null,
    linha.email ? `E-mail: ${mascararEmail(linha.email)}` : null,
    entrega ? `Entrega: ${entrega}` : null,
    temPropriedade
      ? `Propriedade na nota: ${[linha.propriedade_nome, linha.propriedade_cnpj ? `CNPJ ${mascararCnpj(linha.propriedade_cnpj)}` : null].filter(Boolean).join(", ")}`
      : null,
  ].filter(Boolean);
  return {
    tem_dados: true,
    faltando: camposFaltando(linha).map((c) => ROTULO_DO_CAMPO[c]),
    dados_mascarados: linhas.length ? linhas.join("\n") : null,
    cep: linha.cep,
    transportadora_preferida: linha.transportadora_preferida,
    tem_propriedade: temPropriedade,
  };
}

/** Converte a entrada validada nas colunas a gravar (só o que veio). */
export function colunasParaGravar(entrada: DadosDeNotaEntrada): Record<string, string | null> {
  const colunas: Record<string, string | null> = {};
  for (const [campo, valor] of Object.entries(entrada)) {
    if (valor === undefined) continue;
    if (campo === "cpf") {
      colunas.cpf_cifrado = valor ? cifrarCpf(valor) : null;
      colunas.cpf_final = valor ? valor.slice(-2) : null;
      continue;
    }
    colunas[campo] = valor;
  }
  return colunas;
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

const COLUNAS =
  "id, organization_id, contact_id, nome, cpf_cifrado, cpf_final, telefone, email, cep, endereco, cidade, estado, propriedade_nome, propriedade_cnpj, propriedade_ie, propriedade_cep, propriedade_endereco, transportadora_preferida, preenchido_por, updated_at";

/**
 * NOME e E-MAIL moram no CONTATO (`contacts.name` / `contacts.email`), não
 * aqui — pedido do usuário em 09/10: a tela tinha dois "Nome" e dois "E-mail".
 * As colunas `nome`/`email` desta tabela ficam só como reserva: o e-mail que
 * já pertence a OUTRO contato da empresa (índice único `uniq_contacts_org_email`)
 * não pode ir para o contato, e fica guardado aqui para a nota não perder.
 * Quem lê recebe sempre o valor do contato primeiro.
 */
function juntarComOContato(
  linha: LinhaDadosDeNota,
  contato: { name: string | null; email: string | null } | null,
): LinhaDadosDeNota {
  return { ...linha, nome: contato?.name ?? linha.nome, email: contato?.email ?? linha.email };
}

async function lerContato(db: SupabaseClient, organizationId: string, contactId: string) {
  const { data } = await db
    .from("contacts")
    .select("name, email")
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle();
  return (data as { name: string | null; email: string | null } | null) ?? null;
}

export async function lerDadosDeNota(
  db: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<LinhaDadosDeNota | null> {
  const [{ data, error }, contato] = await Promise.all([
    db
      .from("contato_dados_de_nota")
      .select(COLUNAS)
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .maybeSingle(),
    lerContato(db, organizationId, contactId),
  ]);
  if (error) throw new Error(`dados de nota: ${error.message}`);
  return data ? juntarComOContato(data as LinhaDadosDeNota, contato) : null;
}

/**
 * Grava (cria ou atualiza) só os campos que vieram. `organizationId` vem de
 * fonte confiável (sessão ou chave do bot), nunca do corpo. Nome e e-mail vão
 * para o CONTATO (ver `juntarComOContato`); o resto, para esta tabela.
 */
export async function gravarDadosDeNota(
  db: SupabaseClient,
  organizationId: string,
  contactId: string,
  entrada: DadosDeNotaEntrada,
  preenchidoPor: "bot" | "equipe",
): Promise<LinhaDadosDeNota> {
  const { nome, email, ...resto } = entrada;
  const colunas = colunasParaGravar(resto);

  const doContato: Record<string, string | null> = {};
  if (nome !== undefined) doContato.name = nome;
  if (email !== undefined) doContato.email = email;
  if (Object.keys(doContato).length > 0) {
    let { error } = await db
      .from("contacts")
      .update(doContato)
      .eq("organization_id", organizationId)
      .eq("id", contactId);
    if (error?.code === "23505" && "email" in doContato) {
      // E-mail de OUTRO contato da empresa: o contato fica sem ele e a nota
      // guarda (reserva), em vez de a gravação inteira falhar.
      delete doContato.email;
      colunas.email = email ?? null;
      error = Object.keys(doContato).length
        ? (await db.from("contacts").update(doContato).eq("organization_id", organizationId).eq("id", contactId)).error
        : null;
    }
    if (error) throw new Error(`gravar nome/e-mail no contato: ${error.message}`);
    // Uma fonte só: o que foi para o contato sai da reserva.
    if ("name" in doContato) colunas.nome = null;
    if ("email" in doContato) colunas.email = null;
  }

  const { data, error } = await db
    .from("contato_dados_de_nota")
    .upsert(
      {
        organization_id: organizationId,
        contact_id: contactId,
        ...colunas,
        preenchido_por: preenchidoPor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,contact_id" },
    )
    .select(COLUNAS)
    .single();
  if (error) throw new Error(`gravar dados de nota: ${error.message}`);
  return juntarComOContato(data as LinhaDadosDeNota, await lerContato(db, organizationId, contactId));
}

/**
 * Pelo BOT, um campo errado não pode derrubar os outros: o cliente mandou dez
 * dados de uma vez, e recusar tudo por causa de um faria o bot pedir tudo de
 * novo. Valida campo a campo; devolve o que passou e, do que não passou, a
 * mensagem para o bot pedir só aquele.
 */
export function separarCamposValidos(campos: Record<string, unknown>): {
  validos: DadosDeNotaEntrada;
  problemas: { campo: string; mensagem: string }[];
} {
  const forma = dadosDeNotaEntradaSchema.shape;
  const validos: Record<string, unknown> = {};
  const problemas: { campo: string; mensagem: string }[] = [];
  for (const [campo, valor] of Object.entries(campos)) {
    const regra = forma[campo as keyof typeof forma];
    if (!regra) continue;
    const r = regra.safeParse(valor);
    if (r.success) {
      if (r.data !== undefined) validos[campo] = r.data;
    } else {
      problemas.push({ campo, mensagem: r.error.issues[0]?.message ?? "Dado inválido." });
    }
  }
  return { validos: validos as DadosDeNotaEntrada, problemas };
}

/** Os campos que mudaram, por NOME (o audit não leva o valor do CPF). */
export function camposAlterados(entrada: DadosDeNotaEntrada): string[] {
  return Object.entries(entrada)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
}

/**
 * Troca o CPF por `***.***.***-NN` nas conversas guardadas (Inbox e, quando
 * existem, as tabelas do bot) — ver `fn_mascarar_cpf_nas_conversas`, migration
 * 0237. Falha ABERTA: os dados de nota já foram gravados, e um erro aqui não
 * pode desfazer isso; fica no log para ser refeito.
 */
export async function mascararCpfNasConversas(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  cpf: string,
): Promise<Record<string, number> | null> {
  const { data, error } = await admin.rpc("fn_mascarar_cpf_nas_conversas", {
    p_organization_id: organizationId,
    p_contact_id: contactId,
    p_cpf: cpf,
  });
  if (error) {
    logger.error("[dados-de-nota] CPF não foi mascarado nas conversas", {
      organization_id: organizationId,
      contact_id: contactId,
      detail: error.message.slice(0, 160),
    });
    return null;
  }
  return (data as Record<string, number> | null) ?? null;
}
