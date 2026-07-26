import { PrismaClient } from '@prisma/client';

// Single shared Prisma client instance (avoids exhausting MySQL connections
// under tsx watch / hot reload in dev).
export const prisma = new PrismaClient();
