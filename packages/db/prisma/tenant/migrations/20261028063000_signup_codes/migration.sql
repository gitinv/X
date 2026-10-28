CREATE TABLE "SignupCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "clientId" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SignupCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SignupCode_tenantId_createdAt_idx" ON "SignupCode"("tenantId", "createdAt");
ALTER TABLE "SignupCode" ADD CONSTRAINT "SignupCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "SalonProfile"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
