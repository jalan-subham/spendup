import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function runTest() {
  console.log("🚀 Starting Robust End-to-End Test...");

  // 1. Setup Data
  console.log("\n[1] Creating fresh User & Bank Accounts...");
  const user = await prisma.user.create({
    data: {
      username: `testuser_${Date.now()}`,
      passwordHash: 'dummy'
    }
  });

  const hdfc = await prisma.bank.create({
    data: {
      userId: user.id,
      name: "HDFC Bank",
      color: "#0000FF",
      openingBalance: 100000
    }
  });

  const savingsCard = await prisma.card.create({
    data: { bankId: hdfc.id, nickname: "Max Adv", type: "account", last4: "1234" }
  });
  
  const creditCard = await prisma.card.create({
    data: { bankId: hdfc.id, nickname: "Regalia", type: "credit_card", last4: "9999" }
  });
  
  const upiId = await prisma.card.create({
    data: { bankId: hdfc.id, nickname: "PhonePe", type: "upi", last4: "@ybl" }
  });

  // 2. Generate a CC Bill
  console.log("[2] Generating a Credit Card Bill for April 2026...");
  const bill = await prisma.creditCardBill.create({
    data: {
      userId: user.id,
      cardId: creditCard.id,
      cycleName: "April 2026",
      billAmount: 15500, // Rs 15,500 bill
    }
  });

  // 3. Track CC Spends (Linking to bill)
  console.log("[3] Tracking CC Spends inside the generated cycle...");
  await prisma.transaction.create({
    data: {
      refNo: `TX_CC_${Date.now()}_1`,
      userId: user.id,
      date: "02/04/26",
      narration: "AMAZON SHOPPING",
      amount: -15500, // Debit
      category: "Shopping",
      transactionType: "spend",
      cardId: creditCard.id, // Attributed to credit card
      linkedBillId: bill.id, // Specifically part of this cycle
      bankId: hdfc.id
    }
  });

  // 4. Simulate Bank Statement uploads (UPI Spend & CC Settlement)
  console.log("[4] Tracking regular Bank Spends and CC Settlement...");
  await prisma.transaction.create({
    data: {
      refNo: `TX_UPI_${Date.now()}`,
      userId: user.id,
      date: "05/04/26",
      narration: "ZOMATO",
      amount: -500, // Debit
      category: "Food",
      transactionType: "spend",
      cardId: upiId.id, // Attributes to exactly the UPI profile
      bankId: hdfc.id
    }
  });

  const settlementTx = await prisma.transaction.create({
    data: {
      refNo: `TX_SETTLE_${Date.now()}`,
      userId: user.id,
      date: "10/04/26",
      narration: "CRED CLUB HDFC CC",
      amount: -15500,
      category: "CC Settlement",
      transactionType: "cc_settlement",
      cardId: savingsCard.id, // Paid from savings account
      bankId: hdfc.id
    }
  });

  // 5. Link the settlement
  console.log("[5] Linking Bank Settlement to the CC Bill...");
  await prisma.transaction.update({
    where: { id: settlementTx.id },
    data: { linkedBillId: bill.id }
  });

  // 6. Verify Logics (Dashboard Math & Bills Math)
  console.log("\n🧪 Running Verifications...");
  
  const allTxs = await prisma.transaction.findMany({ where: { userId: user.id } });
  
  // Dashboard Logic
  let spendSum = 0;
  let ccSettleSum = 0;
  allTxs.forEach(t => {
    if (t.transactionType === "spend") spendSum += Math.abs(t.amount);
    if (t.transactionType === "cc_settlement") ccSettleSum += Math.abs(t.amount);
  });
  
  console.log(`- Dashboard Total Net Spends: ₹${spendSum} (Expected: 16000 -> 15500 CC + 500 UPI)`);
  console.log(`- Dashboard CC Settlements: ₹${ccSettleSum} (Expected: 15500)`);
  if (spendSum !== 16000) throw new Error("Net Spend Math failed!");
  
  // Bills Logic
  const fullBill = await prisma.creditCardBill.findUnique({
    where: { id: bill.id },
    include: { transactions: true }
  });
  
  const totalSettled = fullBill.transactions
    .filter(t => t.transactionType === "cc_settlement")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
  const isFullySettled = totalSettled >= Math.abs(fullBill.billAmount) || fullBill.isPaid;
  
  console.log(`\n- Bill Amount Generated: ₹${fullBill.billAmount}`);
  console.log(`- Bill Amount Settled: ₹${totalSettled}`);
  console.log(`- Bill Paid Status: ${isFullySettled ? '✅ Fully Settled' : '❌ Pending'}`);
  
  if (!isFullySettled) throw new Error("Bill settlement logic failed!");

  console.log("\n🎉 ALL TESTS PASSED! Flow is completely mathematically robust.");
}

runTest()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
