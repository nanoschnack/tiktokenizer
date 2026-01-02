import { env } from "~/env.mjs";
import { openSourceModels, tempLlama3HackGetRevision } from "~/models";
import { promises as fs } from "fs";
import { resolve } from "path";
import { z } from "zod";

const customTokenizerSources: Record<
  string,
  {
    tokenizerUrl: string;
    tokenizerConfig?: Record<string, unknown>;
    tokenizerConfigUrl?: string;
  }
> = {
  "nanoschnack/tokenizer": {
    tokenizerUrl:
      "https://raw.githubusercontent.com/nanoschnack/nanoschnack/refs/heads/main/tokenizer/tokenizer.json",
    tokenizerConfig: {
      tokenizer_class: "PreTrainedTokenizerFast",
      model_max_length: 2048,
      padding_side: "right",
      truncation_side: "right",
    },
  },
};

async function download() {
  for (const modelName of Object.values(openSourceModels.Values)) {
    const [orgId, modelId] = z
      .tuple([z.string(), z.string()])
      .parse(modelName.split("/"));

    const rev = tempLlama3HackGetRevision(modelName);
    const customSource = customTokenizerSources[modelName];

    if (customSource) {
      const targetDir = resolve("public/hf", orgId, modelId);
      const tokenizerPath = resolve(targetDir, "tokenizer.json");
      const configPath = resolve(targetDir, "tokenizer_config.json");

      if (!(await fs.stat(tokenizerPath).catch(() => null))) {
        const res = await fetch(customSource.tokenizerUrl);
        if (!res.ok) {
          throw new Error(
            `Failed to fetch tokenizer.json for ${modelName}: ${res.status} ${res.statusText} (${customSource.tokenizerUrl})`
          );
        }
        await fs.mkdir(targetDir, { recursive: true });
        console.log("Writing to", tokenizerPath);
        await fs.writeFile(tokenizerPath, await res.text());
      }

      if (
        !(await fs.stat(configPath).catch(() => null)) &&
        (customSource.tokenizerConfig || customSource.tokenizerConfigUrl)
      ) {
        let configText = "";
        if (customSource.tokenizerConfigUrl) {
          const res = await fetch(customSource.tokenizerConfigUrl);
          if (!res.ok) {
            throw new Error(
              `Failed to fetch tokenizer_config.json for ${modelName}: ${res.status} ${res.statusText} (${customSource.tokenizerConfigUrl})`
            );
          }
          configText = await res.text();
        } else if (customSource.tokenizerConfig) {
          configText = JSON.stringify(customSource.tokenizerConfig, null, 2);
        }
        if (configText) {
          await fs.mkdir(targetDir, { recursive: true });
          console.log("Writing to", configPath);
          await fs.writeFile(configPath, configText);
        }
      }

      continue;
    }

    for (const file of ["tokenizer.json", "tokenizer_config.json"]) {
      const targetDir = resolve("public/hf", orgId, modelId);
      const targetPath = resolve(targetDir, file);

      if (await fs.stat(targetPath).catch(() => null)) {
        console.log("Skipping", targetPath);
        continue;
      }

      // eg https://huggingface.co/codellama/CodeLlama-7b-hf/resolve/main/tokenizer.json
      const res = await fetch(
        `https://huggingface.co/${orgId}/${modelId}/resolve/${encodeURIComponent(
          rev
        )}/${file}`,
        {
          headers: {
            Authorization: `Bearer ${env.HF_API_KEY}`,
            ContentType: "application/json",
          },
        }
      );

      if (!res.ok) {
        throw new Error(
          `Failed to fetch ${file} for ${modelName}: ${res.status} ${res.statusText} (${res.url})`
        );
      }

      await fs.mkdir(targetDir, { recursive: true });
      console.log("Writing to", targetPath);
      await fs.writeFile(targetPath, await res.text());
    }
  }
}

download();
