import os from 'os';
import fs from 'fs';
import {
    getConfigFileDir,
    getConfigFilePath,
    loadCliConfig,
} from '../utils'


export async function configInit() {
    const defaultConfig = {
        env: 'devnet',
        url: 'https://api.devnet.solana.com',
        keypair: `${os.homedir()}/.config/solana/id.json`,
    };

    const dir = getConfigFileDir();
    if (!fs.existsSync(getConfigFileDir())) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(getConfigFilePath(), JSON.stringify(defaultConfig));
    console.log(`Wrote config to ${getConfigFilePath()}`);
}

export async function configSet(key: string, value: string) {
    if (key !== 'env' && key !== 'url' && key !== 'keypair') {
        console.error(`Key must be env, url or keypair`);
        return;
    }

    const config = JSON.parse(fs.readFileSync(getConfigFilePath(), 'utf8'));
    config[key] = value;
    fs.writeFileSync(getConfigFilePath(), JSON.stringify(config));
}

export async function configGet() {
    const config = loadCliConfig();
    console.log(JSON.stringify(config, null, 4));
}