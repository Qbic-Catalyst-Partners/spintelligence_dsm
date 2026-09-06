pipeline {
    agent any

    environment {
        REGISTRY        = "ghcr.io/qbic-catalyst-partners"
        BACKEND_IMAGE   = "${REGISTRY}/spintelligence_dsm-backend"
        FRONTEND_IMAGE  = "${REGISTRY}/spintelligence_dsm-frontend"
        IMAGE_TAG       = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"
        NAMESPACE       = "spintelligence-dsm"
        // Public IP of the VPS; the frontend calls the backend at this address on port 4000.
        VPS_PUBLIC_IP   = "200.141.4.6"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
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
                    sh """
                        docker build \
                          --build-arg NEXT_PUBLIC_API_URL=http://${VPS_PUBLIC_IP}:4000 \
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
