# Enquete Ravi — Tapetes da China

Site HTML responsivo com 14 tapetes de cozinha, usado pela Ravi para decidir quais modelos importar da China. Votação pública por link.

## Como funciona
- Cada visitante recebe um identificador aleatório salvo no `localStorage` do navegador.
- É possível votar em vários tapetes.
- Cada tapete aceita no máximo 1 voto por navegador.
- O usuário pode retirar o próprio voto.
- Os votos são compartilhados entre todos os visitantes via Supabase.
- O ranking é atualizado automaticamente a cada 20 segundos.

## Backend
Execute `supabase.sql` em um projeto Supabase.
Depois preencha `config.js` com a URL e a publishable key do projeto.

## Publicação
O diretório é estático e pode ser publicado no Vercel, Netlify, Cloudflare Pages ou qualquer host estático.
