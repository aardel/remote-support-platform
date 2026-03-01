# Step-by-step: Deploy secrets (Option B – new key for GitHub)

Use this to create a dedicated SSH key for GitHub Actions and set up all deploy secrets.

---

## Part 1: Create the key (on your computer or server)

Do this on the machine where you have terminal access (your laptop, or the server if you’re there).

### Step 1.1 – Open a terminal

- On Mac: Terminal app or iTerm.
- On Windows: PowerShell or Git Bash.
- On Linux: any terminal.

### Step 1.2 – Create the key pair

Run (copy the whole line):

```bash
ssh-keygen -t ed25519 -C "github-remote-support-deploy" -f ~/.ssh/github_remote_support_deploy -N ""
```

- `-N ""` means no passphrase (so GitHub Actions can use it without prompting).
- This creates:
  - **Private key:** `~/.ssh/github_remote_support_deploy` (for GitHub secret)
  - **Public key:** `~/.ssh/github_remote_support_deploy.pub` (for the server)

### Step 1.3 – Copy the **private** key (for GitHub)

**On Mac/Linux:**

```bash
cat ~/.ssh/github_remote_support_deploy
```

**On Windows (PowerShell):**

```powershell
Get-Content $env:USERPROFILE\.ssh\github_remote_support_deploy
```

Select and copy the **entire** output (from `-----BEGIN OPENSSH PRIVATE KEY-----` through `-----END OPENSSH PRIVATE KEY-----`). Keep it ready for Part 2.

---

## Part 2: Add secrets in GitHub

### Step 2.1 – Open Actions secrets

1. Go to your repo: `https://github.com/aardel/remote-support-platform`
2. Click **Settings**.
3. In the left sidebar, under **Security**, click **Secrets and variables** → **Actions**.

### Step 2.2 – Enable the deploy job (variable)

1. Click the **Variables** tab.
2. Click **New repository variable**.
3. **Name:** `DEPLOY_ENABLED`
4. **Value:** `true`
5. Click **Add variable**.

This tells the workflow to run the deploy job. (GitHub doesn’t allow workflows to check “is a secret set?”, so we use this variable instead.)

### Step 2.3 – Add DEPLOY_SSH_KEY

1. Click **New repository secret**.
2. **Name:** `DEPLOY_SSH_KEY`
3. **Secret:** Paste the full private key you copied in Step 1.3 (the whole block including BEGIN and END lines).
4. Click **Add secret**.

### Step 2.4 – Add SERVER_HOST

1. Click **New repository secret**.
2. **Name:** `SERVER_HOST`
3. **Secret:** Your server hostname or IP, e.g.:
   - `your-domain.example` (or `173.249.10.40`)
   - or `vmi3066396.contaboserver.net`
   - or whatever you use in `ssh user@host`
4. Click **Add secret**.

### Step 2.5 – Add SERVER_USER

1. Click **New repository secret**.
2. **Name:** `SERVER_USER`
3. **Secret:** The SSH username you use to log in (e.g. `root` or your Linux user).
4. Click **Add secret**.

### Step 2.6 – Add SERVER_PACKAGES_PATH (recommended)

1. Click **New repository secret**.
2. **Name:** `SERVER_PACKAGES_PATH`
3. **Secret:** The full path to the `packages` folder on the server. If your app is in `/opt/remote-support`, use:
   - `/opt/remote-support/packages`
4. Click **Add secret**.

You should now have 1 variable (**DEPLOY_ENABLED** = `true`) and 4 secrets: `DEPLOY_SSH_KEY`, `SERVER_HOST`, `SERVER_USER`, `SERVER_PACKAGES_PATH`.

---

## Part 3: Install the public key on the server

The server must accept the new key. Do this once from a terminal where you can already SSH to the server.

### Step 3.1 – SSH into the server

Use your normal login (same user as SERVER_USER, same host as SERVER_HOST):

```bash
ssh root@YOUR_SERVER_IP
```

(or `ssh youruser@your-server.com`).

### Step 3.2 – Create .ssh and authorized_keys (if needed)

On the server, run:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Step 3.3 – Add the public key on the server

**Option A – You’re on the same machine where you created the key**

From your **local** terminal (not the server), run (replace `root` and `YOUR_SERVER_IP` with your SERVER_USER and SERVER_HOST):

```bash
ssh-copy-id -i ~/.ssh/github_remote_support_deploy.pub root@YOUR_SERVER_IP
```

Enter your normal SSH password when asked. After that, the new key is in `~/.ssh/authorized_keys` on the server.

**Option B – You’re on the server and have the public key text**

1. On the machine where you created the key, show the public key:

   ```bash
   cat ~/.ssh/github_remote_support_deploy.pub
   ```

2. Copy the single line (starts with `ssh-ed25519`).
3. On the **server**, run:

   ```bash
   echo "PASTE_THE_LINE_HERE" >> ~/.ssh/authorized_keys
   ```

   Replace `PASTE_THE_LINE_HERE` with the pasted line.

### Step 3.4 – Test login with the new key (optional)

From your **local** machine:

```bash
ssh -i ~/.ssh/github_remote_support_deploy root@YOUR_SERVER_IP
```

You should get a shell without a password. Type `exit` to close.

---

## Part 4: Ensure the packages directory exists on the server

On the server (SSH’d in), run:

```bash
mkdir -p /opt/remote-support/packages
# If your app is elsewhere, use that path instead, e.g.:
# mkdir -p /var/www/remote-support/packages
```

Use the same path you put in **SERVER_PACKAGES_PATH**.

---

## Part 5: Trigger a build and deploy

1. In GitHub, go to **Actions**.
2. Choose **Build Helper (Win + Mac)**.
3. Click **Run workflow** → **Run workflow**.
4. When the run finishes, check the **deploy-templates** job. If it’s green, the EXE and DMG were uploaded to the server.
5. On the server you can confirm:

   ```bash
   ls -la /opt/remote-support/packages/
   ```

   You should see `support-template.exe` and `support-template.dmg` (after a run that built both).

---

## Quick checklist

- [ ] Key created: `~/.ssh/github_remote_support_deploy` and `.pub`
- [ ] Secret **DEPLOY_SSH_KEY** = full private key
- [ ] Secret **SERVER_HOST** = server IP or hostname
- [ ] Secret **SERVER_USER** = SSH user (e.g. `root`)
- [ ] Secret **SERVER_PACKAGES_PATH** = e.g. `/opt/remote-support/packages`
- [ ] Public key added to server `~/.ssh/authorized_keys`
- [ ] `packages` directory exists on server
- [ ] Run **Build Helper (Win + Mac)** and confirm **deploy-templates** succeeds
