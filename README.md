# PR Review Assistant

A Chrome extension that helps get you started with your PR reviews. You'll need an [API key from OpenAI](https://platform.openai.com/api-keys).

## How to install and use

- Install the dependencies `yarn install`
- Run the build script `yarn build`
- Navigate to `chrome://extensions`
- Enable Developer Mode
- Click the 'Load unpacked' button and navigate to the `dist` directory in the project

## Permissions that Chrome needs

- `activeTab` is used to get the URL of the active tab.
- `storage` is used to cache the responses from OpenAI.
- `scripting` is used to fetch the PR description.
