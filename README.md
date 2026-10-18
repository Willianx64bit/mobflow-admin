# MobFlow Admin

Criar o MobFlow Admin integrado ao MobFlow PDV



Quero criar um novo aplicativo chamado MobFlow Admin, separado visualmente do meu aplicativo principal MobFlow PDV, mas integrado a ele de verdade.



1. Antes de começar



Meu aplicativo principal está neste repositório GitHub:



https://github.com/Willianx64bit/mobflow-pos-stock.git



O MobFlow PDV já possui funcionalidades de vendas, produtos, estoque, recebimento, conferência e outras operações.



Antes de desenvolver, analise a estrutura do novo projeto e identifique como o MobFlow existente utiliza o Supabase. Não recrie funcionalidades do PDV nem modifique o projeto principal sem necessidade.



Quero reutilizar o Supabase existente, caso seja compatível, para que os dois aplicativos compartilhem os dados necessários e funcionem de maneira integrada.



2. Painel administrativo geral



Crie um painel exclusivo para o administrador geral do sistema, com acesso protegido.



Esse painel deverá permitir:



- Cadastrar novas empresas.

- Editar os dados das empresas.

- Ativar, suspender e reativar empresas.

- Consultar todas as empresas cadastradas.

- Criar usuários e administradores para cada empresa.

- Vincular usuários à empresa correspondente.

- Alterar permissões de acesso.

- Consultar o status dos usuários.

- Visualizar informações gerais de cada empresa.

- Pesquisar empresas por nome e CNPJ, quando informado.



3. Gerenciamento de usuários



Cada empresa deverá ter seus próprios usuários, com permissões independentes.



Quero poder definir quem será o administrador de cada empresa e permitir que esse administrador gerencie seus funcionários, caso essa permissão seja habilitada.



Prepare a estrutura para diferentes níveis de acesso, como:



- Administrador geral do MobFlow.

- Administrador da empresa.

- Gerente.

- Operador de caixa.



As permissões devem ser aplicadas no banco de dados e no servidor, e não apenas escondendo botões na interface.



4. Integração real com o MobFlow PDV



O MobFlow Admin não pode ser apenas uma demonstração visual.



Quando eu cadastrar uma empresa e criar seu administrador, essa empresa deverá poder acessar o MobFlow PDV com as credenciais correspondentes.



Cada empresa deverá visualizar somente seus próprios produtos, estoque, vendas, recebimentos, conferências e demais informações privadas.



Os dados precisam permanecer separados entre empresas, mesmo quando elas utilizarem o mesmo aplicativo e o mesmo banco de dados.



5. Supabase e segurança



Utilize o Supabase para autenticação, banco de dados e controle de acesso.



Analise as tabelas e políticas existentes antes de fazer alterações.



Implemente ou adapte a estrutura para incluir empresas, vínculos entre usuários e empresas, funções e permissões.



Utilize políticas RLS para impedir que uma empresa acesse os dados de outra.



A criação de usuários deverá ser realizada por um mecanismo seguro no servidor, como uma Edge Function, quando necessário. Nunca exponha a chave de serviço do Supabase no navegador.



Não crie um segundo banco isolado que impeça a integração com o PDV existente.



6. Interface



Crie uma interface administrativa moderna, simples, profissional e responsiva, compatível com computadores e celulares.



O menu lateral deverá conter:



- Dashboard.

- Empresas.

- Usuários.

- Permissões.

- Planos e assinaturas, preparados para implementação futura.

- Configurações.



O dashboard deverá mostrar a quantidade de empresas cadastradas, empresas ativas, empresas suspensas e usuários registrados.



7. Regras importantes



Não invente tabelas, integrações ou funcionalidades existentes sem verificar.



Não apague dados do MobFlow.



Não substitua a autenticação existente sem analisar os impactos.



Não altere o funcionamento das vendas e do estoque sem necessidade.



Antes de implementar, apresente um resumo da arquitetura existente, das alterações necessárias no Supabase e de como será feita a integração.



Depois, implemente as funcionalidades de forma real, com persistência no banco de dados, autenticação, autorização e tratamento de erros.



Objetivo final: ter dois aplicativos separados — MobFlow Admin e MobFlow PDV — funcionando juntos, permitindo que eu administre diversas empresas e seus usuários sem misturar os dados de cada uma.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/687c3bc4-2b9d-44f4-8522-aef7215103c0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
