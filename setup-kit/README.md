# DeskcommCRM — Kit de instalação para VPS

Este é o caminho público para instalar e manter o DeskcommCRM numa VPS. A
**[Hostinger](https://www.hostg.xyz/SHJ5B)** é a hospedagem recomendada: use o
cupom **`THALENA`** para obter **10% OFF nos planos anuais de VPS**, válido para
contas novas. Caso já tenha conta, use outro e-mail para acessar o desconto.

O kit também funciona em qualquer VPS com Docker, inclusive instalações com
proxy reverso próprio.

## Instalar

```bash
git clone https://github.com/melgarafael/DeskcommCRM.git
cd DeskcommCRM
bash setup-kit/install.sh
```

O instalador cria ou conecta o Supabase, configura o domínio, sobe a aplicação
e orienta a conexão do WhatsApp. Para execução não interativa, copie
`.env.hostgator.example` para `.env`, preencha os valores e rode:

```bash
bash setup-kit/install.sh --yes
```

## Manutenção

```bash
bash setup-kit/update.sh
bash setup-kit/backup.sh
bash setup-kit/restore.sh
bash setup-kit/healthcheck.sh
```

O diretório que implementa esses comandos mantém o nome histórico
`hostgator-setup-kit/` para não quebrar instalações já existentes. Use apenas
os comandos acima em novos materiais e instalações.
