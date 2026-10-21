# AutoCoder hosting

The page is on GitHub Pages. The API runs on Google Cloud Run. MedGemma runs on a Vertex AI endpoint that scales to zero when nobody is using it.

| Part | Where | Address |
|---|---|---|
| Page | GitHub Pages (`main` branch) | https://mattcordell.github.io/callistemon/MedGemma/autocoder/static/ |
| API (`server.py`) | Cloud Run service `autocoder`, us-central1 | https://autocoder-6515564380.us-central1.run.app |
| MedGemma 1.5 4B | Vertex AI endpoint `mg-endpoint-0c12b6ca-97e1-40e9-86c1-9ea493e41b64`, us-central1 | set in `medgemma_pipeline.py` |

Google Cloud project: `api-project-6515564380`.

`static/config.js` chooses the API: the Cloud Run address on `github.io`, or the local server everywhere else. Local runs work as before (see `server.py`).

## Update the page

Merge to `main`. GitHub Pages publishes it within a few minutes.

## Update the API

Run from the repository root (PowerShell):

```powershell
gcloud run deploy autocoder --source MedGemma --region us-central1 --project api-project-6515564380
```

Cloud Build uses `MedGemma/Dockerfile`. `MedGemma/.gcloudignore` keeps `.env` out of the upload.

Settings on the service (they carry over to each deploy):
- Service account `autocoder-run`, with the Vertex AI User role and access to both secrets
- Secrets `icd-client-id` and `icd-client-secret` (Secret Manager), passed in as `ICD_CLIENT_ID` and `ICD_CLIENT_SECRET`
- Min 0 and max 1 instances, 300 s timeout, 512 MiB memory. Max 1 matters: the rate limit is kept in memory.

To change an ICD secret:

```powershell
"NEW-VALUE" | gcloud secrets versions add icd-client-secret --data-file=- --project api-project-6515564380
```

## How MedGemma scale-to-zero works

The endpoint uses Vertex AI scale-to-zero, which is a Preview feature.

- When idle, it runs no replicas and costs nothing.
- A request while it's at zero gets HTTP 429. That starts a replica. `server.py` turns the 429 into a "waking up" reply, and the page retries every 20 seconds, for up to 15 minutes.
- Once it's up, it stays up for at least 15 minutes (`--min-scaleup-period 900`). It then scales down after 15 minutes with no requests (`--idle-scaledown-period 900`).
- The badge in the page header (Asleep, Waking, Ready, Offline) comes from `/api/status`. That route reads the endpoint's replica count, so checking doesn't wake the model. "Waking" means no replica yet, but a request got a "not ready" reply in the last 20 minutes.
- While the badge says Asleep, a "Wake up" button shows next to it. It calls `/api/wake`, which sends MedGemma one tiny request to start the wake-up. It's limited to 5 wake-ups per IP address a day, and 20 a day for everyone combined. Presses while the model is already waking or ready don't count. A note beside the button says it takes about 5 minutes. While the model wakes, a countdown from 5:00 shows instead. It starts from when the wake-up began (`waking_for` in `/api/status`), so every viewer sees the same time. Change `WAKE_EXPECTED_S` in `config.js` if the cold start changes. Like the hourly limit, these counts are kept in memory and reset when Cloud Run restarts the server.
- Cold start: **about 4.5 minutes** from the first request to a real answer (279 s, measured 18 Oct 2026). For comparison, a full deploy of the model took about 9.5 minutes.
- The prediction host name (`dedicatedEndpointDns`) changes when the model is redeployed. `medgemma_pipeline.py` reads it from the endpoint, so nothing needs changing after a redeploy.
- Each wake-up costs at least 15 minutes of GPU time (g4-standard-48 with 1x RTX PRO 6000). The Origin check and the 30-requests-an-hour limit per address in `server.py` limit stray wake-ups.

Things to know:
- There's no GPU reservation. If RTX PRO 6000 GPUs are short in us-central1, waking up can fail. Try again later.
- **Vertex undeploys the model if it stays at zero for more than 30 days.** The page then says "MedGemma is offline". To bring it back, use the redeploy command below.

### Redeploy the model with scale-to-zero

```powershell
gcloud beta ai endpoints deploy-model mg-endpoint-0c12b6ca-97e1-40e9-86c1-9ea493e41b64 `
  --region us-central1 --project api-project-6515564380 `
  --model google_medgemma-1_5-4b-it-1792154875490 `
  --display-name google_medgemma-1_5-4b-it-1792154875490 `
  --machine-type g4-standard-48 --accelerator type=nvidia-rtx-pro-6000,count=1 `
  --min-replica-count 0 --initial-replica-count 1 --max-replica-count 1 `
  --min-scaleup-period 900 --idle-scaledown-period 900 --traffic-split 0=100
```

### Turn MedGemma off completely

```powershell
gcloud ai endpoints describe mg-endpoint-0c12b6ca-97e1-40e9-86c1-9ea493e41b64 --region us-central1 --project api-project-6515564380 --format="value(deployedModels[].id)"
gcloud ai endpoints undeploy-model mg-endpoint-0c12b6ca-97e1-40e9-86c1-9ea493e41b64 --deployed-model-id <ID> --region us-central1 --project api-project-6515564380
```

Long-term hosting options for the model are in issue #31.

## Tests

The tests cover the abuse limits, the MedGemma states and the wake button. Google auth and every outside call are mocked, so they need no network and never wake MedGemma.

```powershell
cd MedGemma; .\.venv\Scripts\python -m pip install -r requirements-dev.txt; .\.venv\Scripts\python -m pytest tests
```
