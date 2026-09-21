import {readFileSync} from 'node:fs';
import {readCredentialInput} from './credential-input.mjs';
import {operatorSsh} from './youtube-operator.mjs';
try{
 const mode=process.argv[2];if(!['inspect','backup','provision'].includes(mode)||process.argv.length!==3)throw new Error();
 const {credentials:c,report}=await readCredentialInput('.private/oci-vault-credentials.json');if(!report.ok)throw new Error();
 const result=operatorSsh(readFileSync(new URL('./ilchul-database.py',import.meta.url),'utf8'),{mode,accounts:{runtime:c.service_accounts.ilchul_mysql_runtime,migration:c.service_accounts.ilchul_mysql_migration}});
 console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}catch{console.log(JSON.stringify({ok:false,code:'ILCHUL_OPERATOR_FAILED',partialArtifactsPreserved:true}));process.exitCode=1;}
