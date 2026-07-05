# Bible Listener

Aplicativo desktop em Electron, Node.js, TypeScript e Vite para escutar audio continuamente, transcrever via Gladia, detectar referencias biblicas em portugues e abrir a referencia no Holyrics local.

## Como rodar

```bash
npm install --ignore-scripts
npm run build
npm start
```

As chaves podem vir do ambiente (`GLADIA_API_KEY` e `GEMINI_API_KEY`) ou ser salvas na tela de configuracoes.

## Fluxo

1. Selecione o dispositivo de entrada.
2. Informe o local do Holyrics na primeira execucao.
3. Clique em `Ouvir`.
4. Referencias completas com livro, capitulo e versiculo sao abertas automaticamente.
5. Referencias ambiguas abrem uma janela de escolha.
6. `Finalizar` exporta a transcricao em TXT para uma pasta escolhida pelo usuario.

## Observacoes

- As transcricoes ficam somente em memoria ate a exportacao.
- O parser local trata referencias explicitas e chama Gemini apenas quando a frase parece uma referencia biblica incompleta ou ambigua.
- A automacao do Holyrics fica isolada em `HolyricsAutomationService` e usa foco de janela, clipboard e teclas no Windows. Se for necessario maior precisao, essa classe pode ser substituida por uma integracao baseada em UI Automation sem mexer no restante do pipeline.
