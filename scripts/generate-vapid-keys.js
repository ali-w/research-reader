import crypto from 'crypto';

export function generateVAPIDKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  // Extract uncompressed 65-byte public key point (0x04 || X || Y)
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const rawPublic = spkiDer.subarray(spkiDer.length - 65);

  // Extract 32-byte private key scalar
  const sec1Der = privateKey.export({ type: 'sec1', format: 'der' });
  const rawPrivate = sec1Der.subarray(7, 39);

  return {
    publicKey: rawPublic.toString('base64url'),
    privateKey: rawPrivate.toString('base64url'),
  };
}

if (process.argv[1]?.endsWith('generate-vapid-keys.js')) {
  const keys = generateVAPIDKeys();
  console.log('\n=== Generated VAPID Keypair ===');
  console.log('VAPID_PUBLIC_KEY:');
  console.log(keys.publicKey);
  console.log('\nVAPID_PRIVATE_KEY:');
  console.log(keys.privateKey);
  console.log('\nSave these as Secret Manager secrets or environment variables.');
}
