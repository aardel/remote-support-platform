# Self-Hosted Deploy Runner Setup

This repo now deploys helper templates from a self-hosted runner with labels:

- `self-hosted`
- `linux`
- `x64`
- `deploy`

## 1) Install required packages (on target server)

```bash
apt update && apt install -y curl tar jq
```

## 2) Create runner user and folders

```bash
useradd -m -s /bin/bash github-runner || true
mkdir -p /opt/actions-runner
chown -R github-runner:github-runner /opt/actions-runner
```

## 3) Download Actions runner (latest Linux x64)

```bash
su - github-runner -c 'cd /opt/actions-runner && \
RUNNER_URL=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r ".assets[] | select(.name | test(\"linux-x64.*tar.gz\")) | .browser_download_url" | head -1) && \
curl -fsSL -o actions-runner.tar.gz "$RUNNER_URL" && \
tar xzf actions-runner.tar.gz'
```

## 4) Register runner to the repo

In GitHub repo:

- `Settings` -> `Actions` -> `Runners` -> `New self-hosted runner` -> `Linux`
- Copy the shown `config.sh` command (contains a short-lived token)

Run it as `github-runner` and include labels `deploy,linux,x64`:

```bash
su - github-runner -c 'cd /opt/actions-runner && ./config.sh --url https://github.com/<OWNER>/<REPO> --token <TOKEN> --labels deploy,linux,x64 --unattended'
```

## 5) Install runner as system service

```bash
cd /opt/actions-runner
./svc.sh install github-runner
./svc.sh start
./svc.sh status
```

## 6) Allow deploy writes

The runner user must write to the deploy folder:

```bash
mkdir -p /opt/remote-support/packages
chown -R github-runner:github-runner /opt/remote-support/packages
```

If app runtime needs different owner, use a shared group and keep group write.

## 7) GitHub repo settings needed

- Variable: `DEPLOY_ENABLED=true`
- Optional secret: `SERVER_PACKAGES_PATH=/opt/remote-support/packages`

No SSH deploy secrets are needed for this workflow path.

## 8) Validation

Run workflow: `Build Helper (Win + Mac)` and confirm `deploy-templates` runs on your self-hosted runner and writes:

- `support-template.exe`
- `support-template.dmg`
- `support-template.version`

in `/opt/remote-support/packages`.
