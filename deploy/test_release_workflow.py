"""Verify fork tag naming and publication gates without publishing artifacts."""
import fnmatch
from pathlib import Path
import subprocess
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "deploy/verify-release-tag.sh"


class ReleaseWorkflowTest(unittest.TestCase):
    def workflow(self, name):
        return yaml.load((ROOT / ".github/workflows" / name).read_text(), Loader=yaml.BaseLoader)

    def test_valid_and_invalid_release_tags(self):
        for tag in ("v4.13.0-1", "v4.13.0-2", "v4.14.0-1", "v10.20.30-123"):
            with self.subTest(tag=tag):
                result = subprocess.run(["bash", str(SCRIPT), tag], capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr.decode())
        for args in ([], ["v4.13.0-1", "extra"], ["v4.13.0"], ["v4.13.0-kano.5"],
                     ["v4.13.0-rc1"], ["v4.13.0-0"], ["v4.13.0-01"], ["v4.13.0-1-extra"],
                     ["vv4.13.0-1"], ["4.13.0-1"], ["v4.13-1"]):
            with self.subTest(args=args):
                result = subprocess.run(["bash", str(SCRIPT), *args], capture_output=True)
                self.assertNotEqual(result.returncode, 0)

    def test_new_release_tags_trigger_portal_verification(self):
        patterns = self.workflow("kano.yml")["on"]["push"]["tags"]
        for tag in ("v4.13.0-1", "v4.13.0-2", "v4.14.0-1"):
            self.assertTrue(any(fnmatch.fnmatchcase(tag, pattern) for pattern in patterns))
        for tag in ("v4.13.0", "v4.13.0-kano.5", "v4.13.0-rc1"):
            self.assertFalse(any(fnmatch.fnmatchcase(tag, pattern) for pattern in patterns))

    def test_release_validation_precedes_portal_and_image(self):
        jobs = self.workflow("kano.yml")["jobs"]
        self.assertEqual(jobs["portal"]["needs"], "release-config")
        self.assertEqual(jobs["image"]["needs"], "portal")
        self.assertEqual(jobs["image"]["if"], "startsWith(github.ref, 'refs/tags/v')")
        steps = jobs["release-config"]["steps"]
        self.assertEqual(steps[0]["with"]["fetch-depth"], "0")
        guard = next(step for step in steps if step.get("name") == "Verify release tag and source")
        self.assertEqual(guard["if"], "startsWith(github.ref, 'refs/tags/')")
        self.assertEqual(guard["env"]["RELEASE_TAG"], "${{ github.ref_name }}")
        self.assertIn('bash deploy/verify-release-tag.sh "$RELEASE_TAG"', guard["run"])
        self.assertIn('git merge-base --is-ancestor "$GITHUB_SHA" origin/kano/main', guard["run"])

    def test_image_version_and_platforms_remain_fixed(self):
        steps = self.workflow("kano.yml")["jobs"]["image"]["steps"]
        build = next(step["with"] for step in steps if step.get("uses") == "docker/build-push-action@v6")
        self.assertEqual(build["tags"], "ghcr.io/qianmokano/casdoor-kano:${{ github.ref_name }}")
        self.assertEqual(build["platforms"], "linux/amd64,linux/arm64")
        self.assertIn("org.opencontainers.image.version=${{ github.ref_name }}", build["labels"])

    def test_upstream_workflow_cannot_publish_fork_releases(self):
        jobs = self.workflow("build.yml")["jobs"]
        for job in ("github-release", "docker-release"):
            self.assertIn("github.repository == 'casdoor/casdoor'", jobs[job]["if"])


if __name__ == "__main__":
    unittest.main()
