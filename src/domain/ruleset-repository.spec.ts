import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { mocked, Mocked } from "jest-mock";
import { GitClient } from "../infrastructure/git";
import { Repository } from "./repository";
import fs from "node:fs";
import path from "node:path";
import {
  InvalidModuleFileError,
  MissingFilesError,
  RulesetRepository,
} from "./ruleset-repository";
import { fakeModuleFile } from "../test/mock-template-files";

jest.mock("node:fs");
jest.mock("../infrastructure/git");

let gitClient: Mocked<GitClient>;

beforeEach(() => {
  jest.clearAllMocks();
  gitClient = mocked(new GitClient());
  Repository.gitClient = gitClient;
});

describe("create", () => {
  test("creates repository when requried files exist", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");
    expect(rulesetRepo.canonicalName).toEqual("bar/foo");
  });

  test("complains about missing required files", async () => {
    mockRulesetFiles({ skipModuleFile: true, skipSourceFile: true });
    let thrownError!: Error;
    try {
      await RulesetRepository.create("foo", "bar", "main");
    } catch (e) {
      thrownError = e;
    }

    expect(thrownError).toBeInstanceOf(MissingFilesError);
    expect((thrownError as MissingFilesError).missingFiles.length).toEqual(2);
    expect((thrownError as MissingFilesError).missingFiles).toContain(
      "MODULE.bazel"
    );
    expect((thrownError as MissingFilesError).missingFiles).toContain(
      path.join(RulesetRepository.BCR_TEMPLATE_DIR, "source.template.json")
    );
  });

  test("complains if it cannot parse the module name from the module file", async () => {
    mockRulesetFiles({ invalidModuleContents: true });
    let thrownError!: Error;
    try {
      await RulesetRepository.create("foo", "bar", "main");
    } catch (e) {
      thrownError = e;
    }

    expect(thrownError).toBeInstanceOf(InvalidModuleFileError);
  });
});

describe("moduleFilePath", () => {
  test("gets path to the MODULE.bazel file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.moduleFilePath).toEqual(
      path.join(rulesetRepo.diskPath, "MODULE.bazel")
    );
  });
});

describe("metadataTemplatePath", () => {
  test("gets path to the metadata.template.json file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.metadataTemplatePath).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "metadata.template.json"
      )
    );
  });
});

describe("presubmitPath", () => {
  test("gets path to the presubmit.yml file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.presubmitPath).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "presubmit.yml"
      )
    );
  });
});

describe("sourceTemplatePath", () => {
  test("gets path to the source.template.json file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.sourceTemplatePath).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "source.template.json"
      )
    );
  });
});

describe("moduleName", () => {
  test("returns the correct module name", async () => {
    mockRulesetFiles({ moduleName: "rules_foo" });
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.moduleName).toEqual("rules_foo");
  });

  test("throws when the module name is missing", async () => {
    mockRulesetFiles({ missingModuleName: true });

    let thrownError: Error;
    try {
      await RulesetRepository.create("foo", "bar", "main");
    } catch (e) {
      thrownError = e;
    }

    expect(thrownError!).toBeInstanceOf(InvalidModuleFileError);
  });

  test("throws when there is no module name and does not mistakenly parse the name attribute from a dep", async () => {
    mockRulesetFiles({ missingModuleName: true, moduleFileDeps: true });

    let thrownError: Error;
    try {
      await RulesetRepository.create("foo", "bar", "main");
    } catch (e) {
      thrownError = e;
    }

    expect(thrownError!).toBeInstanceOf(InvalidModuleFileError);
  });
});

function mockRulesetFiles(
  options: {
    moduleName?: string;
    missingModuleName?: boolean;
    moduleFileDeps?: boolean;
    skipModuleFile?: boolean;
    skipMetadataFile?: boolean;
    skipPresubmitFile?: boolean;
    skipSourceFile?: boolean;
    invalidModuleContents?: boolean;
  } = {}
) {
  gitClient.clone.mockImplementationOnce(async (url, repoPath) => {
    mocked(fs.existsSync).mockImplementation(((p: string) => {
      if (p === path.join(repoPath, "MODULE.bazel")) {
        return !options.skipModuleFile;
      } else if (
        p ===
        path.join(
          repoPath,
          RulesetRepository.BCR_TEMPLATE_DIR,
          "metadata.template.json"
        )
      ) {
        return !options.skipMetadataFile;
      } else if (
        p ===
        path.join(repoPath, RulesetRepository.BCR_TEMPLATE_DIR, "presubmit.yml")
      ) {
        return !options.skipPresubmitFile;
      } else if (
        p ===
        path.join(
          repoPath,
          RulesetRepository.BCR_TEMPLATE_DIR,
          "source.template.json"
        )
      ) {
        return !options.skipSourceFile;
      }
      return (jest.requireActual("node:fs") as any).existsSync(path);
    }) as any);

    mocked(fs.readFileSync).mockImplementation(((p: string, ...args: any[]) => {
      if (
        !options.skipModuleFile &&
        p === path.join(repoPath, "MODULE.bazel")
      ) {
        return fakeModuleFile({
          moduleName: options.moduleName,
          missingName: options.missingModuleName,
          invalidContents: options.invalidModuleContents,
          deps: options.moduleFileDeps,
        });
      }
      return (jest.requireActual("node:fs") as any).readFileSync.apply([
        path,
        ...args,
      ]);
    }) as any);
  });
}
