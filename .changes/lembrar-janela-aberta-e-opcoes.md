---
impacto: capacidade_nova
secao: adicionado
titulo: Lembrar com mensagem marcada ao cliente e prazos editáveis
---

O botão "Lembrar" do Inbox agora tem duas partes. Em "Janela aberta", você escreve uma mensagem e marca o horário, e o sistema a envia sozinho ao cliente, só dentro da janela de 24 horas. Se o cliente responder antes ou a janela fechar, a mensagem não vai e você recebe um aviso. Em "Me lembrar", você recebe um aviso interno no prazo que quiser (3 semanas, 2 meses, 3 meses ou outro). A Gestão pode editar os botões das duas partes em "Editar opções...". Precisa da migration 0249 (`mensagens_agendadas`); o envio acontece no mesmo agendamento que já vence os lembretes (`snooze-watcher`).
