import {readFileSync,readdirSync,lstatSync,existsSync} from 'node:fs';
import {resolve,relative,dirname,join,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const args=process.argv.slice(2);
const flag=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const root=resolve(flag('--root')??'plugins/career-application-toolkit');
const die=message=>{throw new Error(message);};
const files=[];
function walk(dir) {
  for(const entry of readdirSync(dir)) {
    const path=join(dir,entry),stat=lstatSync(path);
    if(stat.isSymbolicLink())die('Symlink is not allowed');
    if(stat.isDirectory())walk(path);
    else {
      const name=relative(root,path).replaceAll('\\','/');
      if(!/^(plugin\.json|mcp\.json|\.codex-plugin\/plugin\.json|(?:skills|references)\/[a-zA-Z0-9_./-]+)$/.test(name)||!['.json','.md','.yaml','.svg','.py'].includes(extname(name)))die(`Unexpected package file: ${name}`);
      const body=readFileSync(path,'utf8');
      if(/sk-or-v1-[A-Za-z0-9]{10,}|-----BEGIN .*PRIVATE KEY-----/.test(body))die('Credential-like content in package');
      files.push(name);
    }
  }
}
walk(root);files.sort();
const read=name=>readFileSync(join(root,name),'utf8');
const manifest=JSON.parse(read('plugin.json')),legacy=JSON.parse(read('.codex-plugin/plugin.json')),mcp=JSON.parse(read('mcp.json'));
if(manifest.name!=='career-application-toolkit'||manifest.name!==legacy.name||manifest.version!==legacy.version||!/^\d+\.\d+\.\d+$/.test(manifest.version))die('Manifest identity/version mismatch');
if(manifest.$schema!=='https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')die('Invalid plugin schema');
const ui=manifest.extensions?.['com.openai']?.interface;
if(JSON.stringify(ui)!==JSON.stringify(legacy.interface)||manifest.description!==legacy.description||JSON.stringify(manifest.author)!==JSON.stringify(legacy.author))die('Compatibility overlay mismatch');
if(mcp.$schema!=='https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'||Object.keys(mcp.mcpServers??{}).length!==1)die('Invalid MCP schema');
const server=mcp.mcpServers['career-quality'];
if(server.type!=='streamable-http'||Object.keys(server).some(k=>!['type','url'].includes(k)))die('MCP must use OAuth, not embedded headers');
const url=new URL(server.url);if(url.protocol!=='https:'||url.pathname!=='/mcp/career'||url.search||url.hash||url.username||url.password)die('Invalid MCP endpoint');
const skills=files.filter(p=>/^skills\/[^/]+\/SKILL.md$/.test(p));
if(skills.length!==5)die('Expected the existing five skills');
for(const file of files.filter(f=>f.endsWith('.md'))) {
  const body=read(file);
  if(file.endsWith('/SKILL.md')) {
    const match=body.match(/^---\nname: ([a-z0-9-]+)\ndescription: ([^\n]+)\n---\n/);
    if(!match||match[1]!==file.split('/')[1]||match[2].length>1024)die(`Invalid frontmatter: ${file}`);
  }
  for(const link of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const ref=link[1];if(/^https?:|^#/.test(ref))continue;
    const path=resolve(root,dirname(file),ref.split('#')[0]);
    if(relative(root,path).startsWith('..')||!existsSync(path))die(`Missing or unsafe reference: ${file}: ${ref}`);
  }
}
const baseline=flag('--baseline');
if(baseline) {
  const original=JSON.parse(execFileSync('unzip',['-p',resolve(baseline),'plugin.json'],{encoding:'utf8'}));
  if(original.name!==manifest.name||JSON.stringify(original.extensions['com.openai'].interface.defaultPrompt)!==JSON.stringify(ui.defaultPrompt))die('Existing identity/starter prompts changed');
  const oldFiles=execFileSync('unzip',['-Z1',resolve(baseline)],{encoding:'utf8'}).split('\n').filter(p=>p&&!p.endsWith('/'));
  for(const file of oldFiles) {
    if(!files.includes(file))die(`Existing file omitted: ${file}`);
    if(file==='plugin.json'||file==='.codex-plugin/plugin.json'||file.endsWith('/SKILL.md'))continue;
    const original=execFileSync('unzip',['-p',resolve(baseline),file]);
    if(!original.equals(readFileSync(join(root,file))))die(`Unrelated original file changed: ${file}`);
  }
}
const output=flag('--output');
if(output) {
  const path=resolve(output);
  if(!path.endsWith('.zip')||!relative(root,path).startsWith('..')||existsSync(path))die('Output must be a new ZIP outside the plugin directory');
  execFileSync('zip',['-X','-q',path,...files],{cwd:root});
  execFileSync('unzip',['-tqq',path]);
  console.log(JSON.stringify({archive:path,version:manifest.version,skills:skills.length,files:files.length,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
} else if(args.includes('--check'))console.log(JSON.stringify({version:manifest.version,skills:skills.length,files:files.length}));
else die('Use --check or --output /absolute/path/new.zip');
