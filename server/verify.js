// server/verify.js
require('dotenv').config();

console.log('🔍 Verifying LTI Configuration...\n');

const requiredVars = [
  'LTI_ENCRYPTION_KEY',
  'MONGO_URL',
  'LTI_CLIENT_ID',
  'LTI_PLATFORM_JWKS',
  'LTI_PLATFORM_OIDC_AUTH',
  'LTI_PLATFORM_TOKEN_URL'
];

let allGood = true;

requiredVars.forEach(varName => {
  if (!process.env[varName]) {
    console.log(`❌ Missing: ${varName}`);
    allGood = false;
  } else {
    console.log(`✅ ${varName}: ${process.env[varName].substring(0, 20)}...`);
  }
});

console.log('\n📋 URL Configuration:');
console.log(`   Login URL: https://${process.env.BASE_HOST || 'lti.icnpaim.cl'}/lti/login`);
console.log(`   Launch URL: https://${process.env.BASE_HOST || 'lti.icnpaim.cl'}/lti/launch`);
console.log(`   JWKS URL: https://${process.env.BASE_HOST || 'lti.icnpaim.cl'}/.well-known/jwks.json`);

if (allGood) {
  console.log('\n🎉 All required variables are present!');
} else {
  console.log('\n❌ Missing required environment variables');
  process.exit(1);
}