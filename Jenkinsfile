pipeline {
    agent any

    environment {
        DOCKER_IMAGE = "quang1709/data-hub:latest"
        DOCKER_CREDENTIALS_ID = 'quang1709-dockerhub'
        KUBE_CONFIG_ID = 'kubeconfig-credentials'
        DEPLOYMENT_NAME = 'data-hub-kltn-service'
        DEPLOYMENT_NAMESPACE = 'argocd'
        // Thêm biến môi trường từ Jenkins
        DATABASE_HOST = credentials('DATABASE_HOST')
        DATABASE_PORT = credentials('DATABASE_PORT')
        DATABASE_USERNAME = credentials('DATABASE_USERNAME')
        DATABASE_PASSWORD = credentials('DATABASE_PASSWORD')
        DATABASE_NAME = credentials('DATABASE_NAME')
        HUGGING_FACE_TOKEN = credentials('HUGGING_FACE_TOKEN')
        LLM_API_ENDPOINT = credentials('LLM_API_ENDPOINT')
        LLM_API_KEY = credentials('LLM_API_KEY')
    }

    stages {
        stage('Checkout Code') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }

        // stage('Lint Check') {
        //     steps {
        //         sh 'npm run lint'
        //     }
        // }

        stage('Build Application') {
            steps {
                sh 'npm run build'
            }
        }

        // stage('Test Application') {
        //     steps {
        //         sh 'npm test'
        //     }
        // }

        stage('Build Docker Image') {
            steps {
                // Tạo file .env từ biến môi trường Jenkins
                sh '''
                cat > .env << EOL
# Database Configuration
DATABASE_HOST=${DATABASE_HOST}
DATABASE_PORT=${DATABASE_PORT}
DATABASE_USERNAME=${DATABASE_USERNAME}
DATABASE_PASSWORD=${DATABASE_PASSWORD}
DATABASE_NAME=${DATABASE_NAME}

# HuggingFace Configuration
HUGGING_FACE_TOKEN=${HUGGING_FACE_TOKEN}

# LLM API Configuration
LLM_API_ENDPOINT=${LLM_API_ENDPOINT}
LLM_API_KEY=${LLM_API_KEY}
EOL
                '''
                
                // Xây dựng Docker image và copy file .env vào
                sh "docker build -t ${DOCKER_IMAGE} ."
            }
        }

        stage('Push Docker Image') {
            steps {
                withCredentials([usernamePassword(credentialsId: "${DOCKER_CREDENTIALS_ID}", usernameVariable: 'DOCKER_USERNAME', passwordVariable: 'DOCKER_PASSWORD')]) {
                    sh "echo $DOCKER_PASSWORD | docker login -u $DOCKER_USERNAME --password-stdin"
                    sh "docker push ${DOCKER_IMAGE}"
                }
            }
        }

        // stage('Deploy to Kubernetes') {
        //     steps {
        //         withCredentials([file(credentialsId: "${KUBE_CONFIG_ID}", variable: 'KUBECONFIG')]) {
        //             sh '''
        //                 # Tạo ConfigMap từ biến môi trường
        //                 cat > data-hub-env-configmap.yaml << EOL
        //                 apiVersion: v1
        //                 kind: ConfigMap
        //                 metadata:
        //                   name: data-hub-env
        //                   namespace: ${DEPLOYMENT_NAMESPACE}
        //                 data:
        //                   DATABASE_HOST: "${DATABASE_HOST}"
        //                   DATABASE_PORT: "${DATABASE_PORT}"
        //                   DATABASE_USERNAME: "${DATABASE_USERNAME}"
        //                   DATABASE_PASSWORD: "${DATABASE_PASSWORD}"
        //                   DATABASE_NAME: "${DATABASE_NAME}"
        //                   HUGGING_FACE_TOKEN: "${HUGGING_FACE_TOKEN}"
        //                   LLM_API_ENDPOINT: "${LLM_API_ENDPOINT}"
        //                   LLM_API_KEY: "${LLM_API_KEY}"
        //                 EOL

        //                 kubectl --kubeconfig=$KUBECONFIG apply -f data-hub-env-configmap.yaml
        //                 kubectl --kubeconfig=$KUBECONFIG set image deployment/${DEPLOYMENT_NAME} ${DEPLOYMENT_NAME}=quang1709/data-hub:latest -n ${DEPLOYMENT_NAMESPACE}
        //                 kubectl --kubeconfig=$KUBECONFIG rollout status deployment/${DEPLOYMENT_NAME} -n ${DEPLOYMENT_NAMESPACE}
        //             '''
        //         }
        //     }
        // }
    }

    post {
        success {
            echo 'CI/CD pipeline completed successfully!'
        }
        failure {
            echo 'CI/CD pipeline failed. Please check the logs for details.'
        }
        always {
            // Clean up to save disk space
            sh 'docker system prune -f'
            sh 'rm -f .env' // Xóa file .env sau khi build
        }
    }
}