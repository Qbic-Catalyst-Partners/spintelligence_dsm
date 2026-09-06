# One-time cluster setup

Run these once on the VPS (k3s already installed) before the first Jenkins deploy.
Everything after this is automated by the root `Jenkinsfile`.

## 1. Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

## 2. Backend env vars (Secret)

The backend reads all its config from env vars (see `backend/.env`). Load it
straight into a Secret instead of hand-copying each key into a manifest:

```bash
kubectl create secret generic backend-env \
  --from-env-file=backend/.env \
  -n spintelligence-dsm
```

Re-run with `kubectl delete secret backend-env -n spintelligence-dsm` first
whenever `.env` changes, then re-create it and restart the deployment:

```bash
kubectl rollout restart deployment/backend -n spintelligence-dsm
```

## 3. GHCR pull secret

The repo/images are private, so the cluster needs credentials to pull them
(a GitHub PAT with `read:packages` scope is enough):

```bash
kubectl create secret docker-registry ghcr-creds \
  --docker-server=ghcr.io \
  --docker-username=<your-github-username> \
  --docker-password=<github-PAT-with-read:packages> \
  -n spintelligence-dsm
```

## 4. Jenkins credentials

In Jenkins, add a Username/Password credential with ID `ghcr-creds`
(a GitHub PAT with `write:packages` scope) — used by the `Login to GHCR`
stage in the Jenkinsfile to push images.

If the Jenkins agent runs on the VPS itself, no extra kubeconfig is needed —
just make sure the Jenkins user can read k3s's kubeconfig:

```bash
sudo mkdir -p /var/lib/jenkins/.kube
sudo cp /etc/rancher/k3s/k3s.yaml /var/lib/jenkins/.kube/config
sudo chown jenkins:jenkins /var/lib/jenkins/.kube/config
```

If Jenkins runs elsewhere, add a "Secret file" credential holding the
kubeconfig and wrap the deploy stage in `withKubeConfig` instead.

## 5. First deploy

Trigger the Jenkins job once. After it finishes:

```bash
kubectl get svc -n spintelligence-dsm
```

k3s's built-in ServiceLB binds each `LoadBalancer` Service to the node's own
IP, so `EXTERNAL-IP` should show the VPS public IP with:
- frontend reachable at `http://200.141.4.6:3000`
- backend reachable at `http://200.141.4.6:4000`

This matches what's already hardcoded in `frontend/src/apis/apiConfig.js`
and `CORS_ORIGINS` in `backend/.env` — update both if the public IP ever
changes.

## Notes

- `backend-uploads` PVC uses k3s's default `local-path` storage class, which
  is a hostPath under the hood — it survives pod restarts but not node loss.
  Back it up separately (it's not covered by any DB backup).
- Postgres (Supabase) and MSSQL are both external and unaffected — nothing to
  run in-cluster for them.
- No domain/TLS is configured. If you add a domain later, put Traefik
  (bundled with k3s) in front with an `Ingress` + `cert-manager` instead of
  exposing the two `LoadBalancer` Services directly.
