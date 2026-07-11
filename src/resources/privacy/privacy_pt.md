# Política de Privacidade
*Última atualização: 27 de junho de 2026*

Esta Política de Privacidade detalha as práticas de privacidade para o aplicativo de desktop local Codeoba (o "Aplicativo") e o site codeoba.com (o "Site"). Tanto o Aplicativo quanto o Site são desenvolvidos, publicados e operados pela What AI Can Do, LLC (a "Empresa").

Leia esta política com atenção. Se você não concordar com estes termos, não utilize o Aplicativo ou o Site.

---

## 1. Princípio Principal: Local-First por Padrão
> O Codeoba é construído para ser um aplicativo local-first. Suas transcrições, índices de banco de dados, caches e modelos semânticos são armazenados inteiramente em sua máquina local.

Principais aspectos desta implementação local-first incluem:
- **Zero Logs Remotos:** Transcrições de conversas agregadas de diretórios de assistentes locais (Claude Code, Google Antigravity, Cursor, OpenAI Codex, Copilot, etc.) são processadas off-line e analisadas diretamente no tempo de execução do cliente de desktop.
- **Banco de Dados SQLite e Cache Local:** Todas as sessões indexadas, logs, palavras-chave de pesquisa e dados de desempenho são persistidos em um diretório de cache local.
- **Indexação Vetorial Local:** Para a correspondência semântica de consultas, o aplicativo baixa um modelo de transformador quantizado (all-MiniLM-L6-v2) localmente. Todos os cálculos de similaridade rodam na CPU do seu dispositivo sem envio de dados para APIs de terceiros.

## 2. Diagnósticos e Verificações de Atualização Automática
Para manter a plataforma operacional e segura, o Codeoba realiza verificações básicas:
- **Verificações de Atualização Automática de Software:** Se você consentir explicitamente, o aplicativo consulta nosso servidor de atualizações para verificar as versões mais recentes. Parâmetros de rede padrão (como a versão do aplicativo e a preferência de idioma, juntamente com a versão do sistema operacional e a arquitetura da CPU do seu sistema) são enviados para recuperar o manifesto de versão, mas nenhum dado pessoal ou de conversação é coletado.
- **Log de Telemetria e Diagnóstico:** Para monitorar a integridade do serviço e evitar abusos no limite de taxa de chamadas da API, as solicitações de atualização são registradas no GCP Cloud Logging, que conhece intrinsecamente o endereço IP do cliente de onde as solicitações se originam. Esses registros capturam detalhes do SO e o GUID de instalação anônimo. Todos esses registros são retidos por 30 dias e depois excluídos permanentemente de forma automática.

## 3. Analíticas do Site e Consentimento de Cookies
Para analisar o tráfego e monitorar taxas de downloads, o Site utiliza o Google Analytics (GA4). Por padrão, a coleta analítica é totalmente desativada e nenhum cookie é armazenado.

Quando você visita o Site, um banner de privacidade é exibido:
- **Consentimento Aceito:** Se aceitar, carregamos o Google Analytics dinamicamente. Ele usará cookies permanentes (como _ga e _ga_<container-id>) para monitorar acessos e cliques de download. Seu IP é anonimizado.
- **Consentimento Recusado:** Se recusar, o Google Analytics nunca é carregado. Nenhum cookie é salvo e nenhuma coleta de impressão digital de dispositivo ocorre.

Você pode retirar seu consentimento ou redefinir sua escolha a qualquer momento: [Gerenciar Preferências de Privacidade](#) (isso limpa sua escolha e exibe o banner novamente).

## 4. Compartilhamento de Informações
Não vendemos, alugamos ou comercializamos seus dados pessoais. Compartilhamos apenas as informações técnicas limitadas necessárias para operar nosso serviço de atualização e diagnóstico com o prestador de serviços terceirizado de confiança (suboperador) abaixo:
- **Infraestrutura de Nuvem:** Usamos a Google Cloud Platform (GCP) Cloud Logging para armazenar logs de telemetria padrão (como endereços IP e informações do dispositivo para verificações de atualização) para fins de diagnóstico e segurança. Esses logs são eliminados automaticamente após 30 dias.

## 5. Segurança dos Dados Locais
Como seus dados são armazenados localmente, a segurança depende do seu próprio dispositivo. Recomendamos o uso de criptografia de disco (como FileVault no macOS) e senhas fortes.

## 6. Alterações nesta Política
A Empresa reserva-se o direito de modificar esta política. Alterações serão publicadas aqui com a data de "Última atualização". Recomendamos verificar esta página periodicamente.

## 7. Contato
Se tiver dúvidas sobre estas práticas de privacidade, entre em contato:
- **E-mail:** privacy@whataicando.com
- **Organização:** What AI Can Do, LLC
- **Site:** [whataicando.com](https://whataicando.com)
