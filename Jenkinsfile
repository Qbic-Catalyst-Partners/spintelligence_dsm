pipeline {
    agent any

    environment {
        REGISTRY        = "ghcr.io/qbic-catalyst-partners"
        BACKEND_IMAGE   = "${REGISTRY}/spintelligence_dsm-backend"
        FRONTEND_IMAGE  = "${REGISTRY}/spintelligence_dsm-frontend"
        IMAGE_TAG       = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"
        NAMESPACE       = "spintelligence-dsm"
        // Source of truth for both apps' env vars — placed here by hand (WinSCP), never in git.
        ENV_FILES_DIR   = "/var/lib/jenkins/env_files"
        // k3s's kubectl defaults to /etc/rancher/k3s/k3s.yaml (root-only) unless told
        // otherwise; pipeline `sh` steps run non-interactively so ~/.bashrc exports don't
        // apply — this has to be set here. See k8s/README.md for the one-time copy step.
        KUBECONFIG      = "/var/lib/jenkins/.kube/config"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Load env files') {
            steps {
                sh """
                    cp ${ENV_FILES_DIR}/env_backend.txt backend/.env
                    cp ${ENV_FILES_DIR}/env_frontend.txt frontend/.env
                """
            }
        }

        stage('Login to GHCR') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'ghcr-creds', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
                    sh 'echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin'
                }
            }
        }

        stage('Build & Push Backend') {
            steps {
                dir('backend') {
                    sh """
                        docker build -t ${BACKEND_IMAGE}:${IMAGE_TAG} -t ${BACKEND_IMAGE}:latest .
                        docker push ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push ${BACKEND_IMAGE}:latest
                    """
                }
            }
        }

        stage('Build & Push Frontend') {
            steps {
                dir('frontend') {
                    // .env (copied above) is picked up by `next build` automatically and
                    // baked into the JS bundle as NEXT_PUBLIC_API_URL — no build-arg needed.
                    sh """
                        docker build \
                          -f dockerfile \
                          -t ${FRONTEND_IMAGE}:${IMAGE_TAG} -t ${FRONTEND_IMAGE}:latest .
                        docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}
                        docker push ${FRONTEND_IMAGE}:latest
                    """
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                sh """
                    kubectl apply -f k8s/namespace.yaml

                    # Refresh the backend Secret from backend/.env on every deploy, so
                    # editing env_backend.txt on the VPS is enough to roll out changes —
                    # create-or-update, since the Secret already exists after the first run.
                    kubectl create secret generic backend-env \
                      --from-env-file=backend/.env \
                      -n ${NAMESPACE} \
                      --dry-run=client -o yaml | kubectl apply -f -

                    kubectl apply -f k8s/backend-pvc.yaml
                    kubectl apply -f k8s/backend-deployment.yaml
                    kubectl apply -f k8s/backend-service.yaml
                    kubectl apply -f k8s/frontend-deployment.yaml
                    kubectl apply -f k8s/frontend-service.yaml

                    kubectl set image deployment/backend backend=${BACKEND_IMAGE}:${IMAGE_TAG} -n ${NAMESPACE}
                    kubectl set image deployment/frontend frontend=${FRONTEND_IMAGE}:${IMAGE_TAG} -n ${NAMESPACE}

                    kubectl rollout status deployment/backend -n ${NAMESPACE} --timeout=180s
                    kubectl rollout status deployment/frontend -n ${NAMESPACE} --timeout=180s
                """
            }
        }
    }

    post {
        failure {
            echo "Deploy failed - rolling back to previous revision"
            sh """
                kubectl rollout undo deployment/backend -n ${NAMESPACE} || true
                kubectl rollout undo deployment/frontend -n ${NAMESPACE} || true
            """
        }
        always {
            sh 'docker logout ghcr.io || true'
        }
    }
}
