#!/bin/sh
set -e
npx prisma migrate deploy
npx prisma db seed
exec npx next start -p 3000
