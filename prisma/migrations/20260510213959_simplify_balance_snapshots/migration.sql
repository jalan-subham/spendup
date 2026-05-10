/*
  Warnings:

  - You are about to drop the column `fileName` on the `BankBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `openingBalance` on the `BankBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `statementEnd` on the `BankBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `statementStart` on the `BankBalanceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `statementType` on the `BankBalanceSnapshot` table. All the data in the column will be lost.
  - Added the required column `asOfDate` to the `BankBalanceSnapshot` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "BankBalanceSnapshot_userId_bankId_statementEnd_idx";

-- AlterTable
ALTER TABLE "BankBalanceSnapshot" DROP COLUMN "fileName",
DROP COLUMN "openingBalance",
DROP COLUMN "statementEnd",
DROP COLUMN "statementStart",
DROP COLUMN "statementType",
ADD COLUMN     "asOfDate" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "BankBalanceSnapshot_userId_bankId_asOfDate_idx" ON "BankBalanceSnapshot"("userId", "bankId", "asOfDate");
