# Enquete Ravi — Tapetes da China

Site HTML responsivo com 14 tapetes de cozinha, usado pela Ravi para decidir quais modelos importar da China. Votação pública por link.

## Como funciona
- Cada visitante recebe um identificador aleatório salvo no `localStorage` do navegador.
- É possível votar em vários tapetes.
- Cada tapete aceita no máximo 1 voto por navegador.
- O usuário pode retirar o próprio voto.
- Os votos são compartilhados entre todos os visitantes via Supabase.
- O ranking é atualizado automaticamente a cada 20 segundos.

## Painel administrativo
Acesse `admin.html` por link direto (não há link na enquete). Lá é possível adicionar, editar, reordenar, ocultar e excluir tapetes, com upload de imagem para o Storage do Supabase.

- Login por e-mail e senha (Supabase Auth). No primeiro acesso, use "Primeiro acesso: criar senha" e confirme pelo e-mail.
- Só e-mails cadastrados na tabela `admin_users` conseguem alterar dados; qualquer outro login é recusado.
- Para autorizar mais alguém: `insert into public.admin_users (email) values ('pessoa@exemplo.com');`

## Backend
Execute `supabase.sql` em um projeto Supabase.
Depois preencha `config.js` com a URL e a publishable key do projeto.

## Publicação
O diretório é estático e pode ser publicado no Vercel, Netlify, Cloudflare Pages ou qualquer host estático.
