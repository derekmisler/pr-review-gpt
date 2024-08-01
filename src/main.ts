import { marked } from 'marked';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import parsediff from 'parse-diff';
import './style.css';

const spinner = `
<svg
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  class="info animate-spin"
>
  <path
    d="M2 12C2 6.47715 6.47715 2 12 2V5C8.13401 5 5 8.13401 5 12H2Z"
    fill="currentColor"
  />
</svg>
`;
const checkmark = `
<svg
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  class="success"
>
  <path
    d="M10.2426 16.3137L6 12.071L7.41421 10.6568L10.2426 13.4853L15.8995 7.8284L17.3137 9.24262L10.2426 16.3137Z"
    fill="currentColor"
  />
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M1 12C1 5.92487 5.92487 1 12 1C18.0751 1 23 5.92487 23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12ZM12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21Z"
    fill="currentColor"
  />
</svg>
`;
const xcircle = `
<svg
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  class="error"
>
  <path
    d="M12 6C12.5523 6 13 6.44772 13 7V13C13 13.5523 12.5523 14 12 14C11.4477 14 11 13.5523 11 13V7C11 6.44772 11.4477 6 12 6Z"
    fill="currentColor"
  />
  <path
    d="M12 16C11.4477 16 11 16.4477 11 17C11 17.5523 11.4477 18 12 18C12.5523 18 13 17.5523 13 17C13 16.4477 12.5523 16 12 16Z"
    fill="currentColor"
  />
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12Z"
    fill="currentColor"
  />
</svg>
`;

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

class Cache {
  private key: string;
  constructor(key: string) {
    this.key = key;
  }
  setCache(value: any) {
    chrome.storage.local.set({ [this.key]: value });
  }
  async getCache(): Promise<string> {
    const result = await chrome.storage.local.get([this.key]);
    const returnValue = result[this.key];
    return returnValue;
  }
  clearCache() {
    chrome.storage.local.remove([this.key]);
  }
}

class PRReviewer {
  private diffPath: string;
  private title?: string;
  private context?: string;
  private url?: string;
  private navElement: HTMLElement | null;
  private statusIconElement: HTMLElement | null;
  private reviewBtn: HTMLElement | null;
  private copyBtn: HTMLElement | null;
  private apiKeyForm: HTMLFormElement | null;
  private maxTokens = 127000;
  private responseCache: Cache;
  private apiKeyCache: Cache;

  constructor({
    diffPath,
    title,
    context,
    url,
  }: {
    diffPath: string;
    title?: string;
    context?: string;
    url?: string;
  }) {
    this.diffPath = diffPath;
    this.title = title;
    this.context = context;
    this.url = url;
    this.navElement = document.getElementById('nav');
    this.statusIconElement = document.getElementById('status-icon');
    this.reviewBtn = document.getElementById('review-btn');
    this.copyBtn = document.getElementById('copy-btn');
    this.apiKeyForm = document.getElementById(
      'api-key-form'
    ) as HTMLFormElement;
    this.responseCache = new Cache(diffPath);
    this.apiKeyCache = new Cache('open_ai_api_key');
  }

  reset() {
    if (this.navElement) this.navElement.classList.remove('hidden');
    if (this.apiKeyForm) this.apiKeyForm.classList.add('hidden');
    this.responseCache.clearCache();
    this.render(null);
    this.renderError(null);
    this.renderInfo(null);
    this.inProgress(false);
  }

  async inProgress(ongoing: boolean, failed = false) {
    if (ongoing) {
      if (this.statusIconElement) this.statusIconElement.innerHTML = spinner;
      if (this.apiKeyForm) this.apiKeyForm.classList.add('hidden');
      if (this.copyBtn) this.copyBtn.setAttribute('disabled', 'true');
      if (this.reviewBtn) this.reviewBtn.setAttribute('disabled', 'true');
    } else {
      if (this.navElement) this.navElement.classList.remove('hidden');
      if (this.reviewBtn) {
        this.reviewBtn.removeAttribute('disabled');
        this.reviewBtn.onclick = () => {
          this.reset();
          this.reviewPR();
        };
      }
      if (failed) {
        if (this.copyBtn) this.copyBtn.setAttribute('disabled', 'true');
        if (this.statusIconElement) this.statusIconElement.innerHTML = xcircle;
      } else {
        if (this.copyBtn) this.copyBtn.removeAttribute('disabled');
        if (this.statusIconElement)
          this.statusIconElement.innerHTML = checkmark;
      }
    }
  }

  async render(text: string | null) {
    const resultBody = document.getElementById('result');
    if (resultBody) {
      if (text) {
        const html = await marked.parse(text);
        resultBody.innerHTML = html;
      } else {
        this.responseCache.clearCache();
        resultBody.innerHTML = '';
      }
    }
  }

  renderInfo(text: string | null) {
    const infoBody = document.getElementById('info');
    if (infoBody) {
      infoBody.innerText = text || '';
    }
  }

  renderError(text: string | null) {
    const errorBody = document.getElementById('error');
    if (errorBody) {
      errorBody.innerText = text || '';
    }
  }

  setApiKey() {
    this.inProgress(false, true);
    if (this.apiKeyForm) {
      if (this.navElement) this.navElement.classList.add('hidden');
      this.apiKeyForm.classList.remove('hidden');
      const input = document.getElementById(
        'api-key-input'
      ) as HTMLInputElement;
      input.focus();
      this.apiKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        this.inProgress(true);
        const inputValue = input?.value;
        this.apiKeyCache.setCache(inputValue);
        await delay(1000);
        this.reset();
        return this.reviewPR();
      });
      return;
    }
    return this.renderError('OpenAI API Key is missing.');
  }

  async reviewPR() {
    this.inProgress(true);

    const enableCopyToClipboard = (text: string) => {
      if (this.copyBtn) {
        this.copyBtn.onclick = () => {
          this.inProgress(true);
          delay(230).then(() => {
            navigator.clipboard
              .writeText(this.url + '\n' + text)
              .then(() => {
                this.renderInfo('Copied to clipboard!');
                this.inProgress(false);
              })
              .catch((e) => {
                this.renderError(String(e));
                this.inProgress(false, true);
              });
          });
        };
      }
    };
    const cachedResponse = await this.responseCache.getCache();
    if (cachedResponse) {
      this.renderInfo(
        'Note: This is a previous review. Click "Re-review" to get a new review.'
      );
      this.render(cachedResponse);
      this.inProgress(false);
      enableCopyToClipboard(cachedResponse);
      if (this.reviewBtn) {
        this.reviewBtn.onclick = () => {
          this.reset();
          this.reviewPR();
        };
      }
      return;
    }

    const apiKey = await this.apiKeyCache.getCache();
    if (!apiKey) {
      this.setApiKey();
    }
    const openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You are a senior software engineer who has been tasked with reviewing a PR from a co-worker. Only provide feedback on the code changes given; do not introduce yourself.',
      },
    ];

    if (this.title) {
      messages.push({
        role: 'user',
        content: `The PR has the following title: ${this.title}. Do not respond until request is complete.`,
      });
    }

    messages.push({
      role: 'user',
      content: `
      Based on the patch below, your task is:
      - Evaluate the overall design of this code. Does it follow best practices for the language and framework being used?
      - Check the following code for consistent formatting and style guidelines.
      - Evaluate the functionality of this code. Are there any logical errors or potential issues?
      - Assess the performance implications of this code. Suggest optimizations for this code to improve performance.
      - Identify any sections of the code that are hard to read or understand or might be difficult for future engineers to read and maintain.
      - Review the test coverage of this PR. Are there sufficient tests for the new code? Suggest additional test cases that might be necessary for this implementation.

      Do not respond until request is complete.
    `,
    });

    if (this.context) {
      messages.push({
        role: 'user',
        content: `Below is the PR description provided in a markdown format.\n\n ${this.context}\n\nDo not respond until request is complete.`,
      });
    }

    messages.push({
      role: 'user',
      content:
        'Below, you will be provided with the code changes (diffs) in a unidiff format. Do not respond until request is complete.',
    });

    const diff = await window
      .fetch(this.diffPath)
      .then((r) => r.text())
      .then((text = '') => {
        const regex = /GIT\sbinary\spatch(.*)literal\s0/gims;
        return text.replace(regex, '');
      });

    const diffArray: string[] = [];
    const diffParts = parsediff(diff);
    diffParts.forEach((file) => {
      if (
        file?.from?.includes('lock.json') ||
        file?.from?.includes('yarn.lock')
      ) {
        return;
      }

      diffArray.push('```diff');
      if ('from' in file && 'to' in file) {
        diffArray.push('diff --git a/' + file.from + ' b/' + file.to);
      }
      if ('new' in file && file.new === true && 'newMode' in file) {
        diffArray.push('new file mode ' + file.newMode);
      }
      if ('from' in file) {
        diffArray.push('--- ' + file.from);
      }
      if ('to' in file) {
        diffArray.push('+++ ' + file.to);
      }
      if ('chunks' in file) {
        diffArray.push(
          file.chunks
            .map((c) => c.changes.map((t) => t.content).join('\n'))
            .join('\n')
        );
      }
      diffArray.push('```');
    });

    const diffPart = diffArray.join('\n');
    if (diffPart.length >= this.maxTokens) {
      messages.push({
        role: 'user',
        content:
          diffPart.slice(0, this.maxTokens) +
          '\nDo not respond until request is complete.',
      });
      this.renderInfo(
        'Some parts of your patch were truncated as it was larger than 4096 tokens or 15384 characters. The review might not be as complete.'
      );
    } else {
      messages.push({
        role: 'user',
        content: diffPart + '\nDo not respond until request is complete.',
      });
    }

    messages.push({
      role: 'user',
      content:
        'The request is now complete. Please provide me with your code review.',
    });

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
      });
      const response = completion.choices[0].message.content;
      if (response) {
        this.render(response);
        this.inProgress(false);
        this.responseCache.setCache(response);
        enableCopyToClipboard(response);
      } else {
        this.renderError('No response from OpenAI.');
        this.inProgress(false, true);
      }
    } catch (e) {
      const error = String(e);
      this.renderError(error);
      if (error.includes('Incorrect API key provided')) {
        return this.setApiKey();
      }
      return this.inProgress(false, true);
    }
  }
}

async function run() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const prUrlEl = document.getElementById('pr-url');
  if (prUrlEl && tab.url) prUrlEl.textContent = tab.url;

  const [, , , owner, repo, type, number] = tab?.url?.split('/') || [];

  if (type === 'pull') {
    const diffPath = `https://patch-diff.githubusercontent.com/raw/${owner}/${repo}/pull/${number}.patch`;
    const contextExternalResult =
      (
        await chrome.scripting.executeScript({
          target: { tabId: tab.id || 0, allFrames: true },
          func: () => {
            const markdownBody = document.querySelector('.markdown-body');
            if (markdownBody) return markdownBody.textContent;
          },
        })
      )?.[0] || {};

    const prDescription = contextExternalResult?.result;

    const prReviewer = new PRReviewer({
      diffPath,
      title: tab.title,
      context: prDescription,
      url: tab.url,
    });

    prReviewer.reviewPR();
  } else {
    throw Error('This is not a Pull Request.');
  }
}

run();
