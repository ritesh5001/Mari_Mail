#!/usr/bin/env tsx
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main() {
  const confirmEnv = process.env.CONFIRM_WIPE;
  const force = process.argv.includes('--yes') || process.argv.includes('-y');

  if (process.env.NODE_ENV === 'production' && confirmEnv !== '1' && !force) {
    console.error('Refusing to run in production without CONFIRM_WIPE=1 or --yes flag. Set CONFIRM_WIPE=1 to proceed.');
    process.exit(2);
  }

  if (!force && confirmEnv !== '1') {
    console.error('This will DELETE ALL WORKSPACES and USERS. To proceed set CONFIRM_WIPE=1 or pass --yes.');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    console.log('Deleting all workspaces (this cascades to most workspace-scoped data)');
    const workspaces = await prisma.workspace.deleteMany({});
    console.log(`Deleted ${workspaces.count ?? 0} workspaces.`);

    console.log('Cleaning up orphaned tokens and sessions');
    const prt = await prisma.passwordResetToken.deleteMany({});
    const vt = await prisma.verificationToken.deleteMany({});
    const sessions = await prisma.session.deleteMany({});
    const accounts = await prisma.account.deleteMany({});
    console.log(`Deleted passwordResetTokens=${prt.count}, verificationTokens=${vt.count}, sessions=${sessions.count}, accounts=${accounts.count}`);

    console.log('Deleting all users');
    const users = await prisma.user.deleteMany({});
    console.log(`Deleted ${users.count ?? 0} users.`);

    console.log('Wipe complete.');
  } catch (error) {
    console.error('Error during wipe:', (error as Error).message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
