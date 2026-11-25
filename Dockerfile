# eloEscola — imagem de produção
#
# Um único processo Node serve DUAS coisas na mesma origem:
#   · o app React compilado (dist/)
#   · a API Express (/api/*), que é a única com acesso ao banco
#
# Por que a mesma origem importa: o painel administrativo e a agenda pessoal
# dependem de cookies/token em `/api/*`. Servir o front em outro domínio exigiria
# CORS e cookies cross-site — mais superfície de erro sem ganho nenhum.

# ---------------------------------------------------------------------------
# Etapa 1 — build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copia só os manifests primeiro: o cache de camada do Docker reaproveita o
# `npm ci` enquanto as dependências não mudarem.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# As variáveis VITE_* são "assadas" no bundle em tempo de build — não existem
# em runtime. A chave usada aqui é a PUBLICÁVEL (a secreta nunca vai ao navegador).
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_PUBLISHABLE_KEY=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

# ---------------------------------------------------------------------------
# Etapa 2 — runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Só o necessário para `node dist/server.cjs`:
#   · dist/          → app compilado + server.cjs
#   · node_modules   → deps de produção (o bundle deixa as packages externas)
#   · package.json   → resolução de módulos
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/dist ./dist

# `--omit=dev` reduz a imagem; o esbuild marcou as deps como externas, então
# todas as usadas em runtime precisam existir aqui.
RUN npm ci --omit=dev && npm cache clean --force

# O modo fallback grava JSON em `src/db/` (apenas quando não há banco). Em
# produção com Supabase configurado isso não é usado, mas o diretório precisa
# existir e ser gravável para o processo não falhar na inicialização.
RUN mkdir -p /app/src/db /app/uploads && chown -R node:node /app/src/db /app/uploads

# Nunca rodar como root.
USER node

# O servidor lê PORT do ambiente (server.ts) e escuta em 0.0.0.0.
ENV PORT=3000
EXPOSE 3000

# Healthcheck real: a rota responde JSON quando o processo está de pé.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
