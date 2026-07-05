# CI/CD e Releases

Este projeto usa GitHub Actions e Electron Builder para compilar, empacotar e publicar o Bible Listener sem depender da maquina local.

## Workflows

### CI

Arquivo: `.github/workflows/build.yml`

Executa em pushes e pull requests para:

- `main`
- `develop`

O workflow roda em:

- Windows
- Linux
- macOS

Etapas:

1. Checkout do codigo.
2. Configuracao do Node.js 20.
3. Instalacao com `npm ci`.
4. `npm run lint`, caso exista.
5. `npm test`, caso exista.
6. `npm run ci`, que executa typecheck e build.

### Release

Arquivo: `.github/workflows/release.yml`

Executa quando uma tag no padrao `v*.*.*` e enviada ao GitHub.

Exemplos:

- `v1.0.0`
- `v1.0.1`
- `v2.0.0`

O workflow:

1. Confere se a tag bate com a versao do `package.json`.
2. Gera instaladores no Windows, Linux e macOS.
3. Faz upload dos instaladores como artifacts temporarios.
4. Cria uma GitHub Release.
5. Anexa todos os instaladores gerados.

## Como criar uma nova versao

Atualize a versao do projeto:

```bash
npm version patch --no-git-tag-version
```

Outras opcoes:

```bash
npm version minor --no-git-tag-version
npm version major --no-git-tag-version
```

Depois faça commit e push:

```bash
git add .
git commit -m "Release v1.0.0"
git push origin main
```

Crie e envie a tag com a mesma versao do `package.json`:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Se a tag nao bater com a versao do `package.json`, o workflow de release falha antes de gerar instaladores.

## Instaladores gerados

Windows:

- `Setup.exe`
- `Portable.exe`

Linux:

- `AppImage`
- `deb`

macOS:

- `dmg`

Os arquivos ficam disponiveis na aba **Releases** do GitHub assim que o workflow termina.

## Auto Update

O `electron-builder.yml` ja esta preparado com:

```yaml
publish:
  provider: github
  releaseType: release
```

Isso deixa o projeto pronto para usar `electron-updater` futuramente com GitHub Releases. Quando a atualizacao automatica for implementada no app, os metadados publicados pelo Electron Builder poderao ser usados como fonte das atualizacoes.

## Secrets

O workflow usa o `GITHUB_TOKEN` automatico do GitHub Actions para criar Releases e anexar arquivos.

Para assinatura de codigo no futuro, use GitHub Secrets. Exemplos comuns:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

Nunca coloque certificados, tokens ou senhas diretamente no repositorio.

## Acompanhando builds

1. Abra o repositorio no GitHub.
2. Entre na aba **Actions**.
3. Escolha o workflow **CI** ou **Release**.
4. Abra o job desejado para ver logs detalhados.

## Build local

CI local:

```bash
npm ci
npm run ci
```

Gerar instaladores localmente:

```bash
npm run dist
```

Gerar por plataforma:

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

Para builds confiaveis de distribuicao, prefira o GitHub Actions, pois cada plataforma e empacotada em runner proprio.
