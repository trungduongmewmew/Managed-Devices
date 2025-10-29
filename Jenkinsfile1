pipeline {
  agent any
  environment {
    // Jenkins sẽ lấy "Secret" có ID 'spectral-dsn'
    SPECTRAL_DSN = credentials('spectral-dsn')
  }
  stages {
    // Giai đoạn này tải bộ cài đặt Spectral DÙNG DSN CỦA BẠN
    stage('install Spectral') {
      steps {
        sh "curl -L 'https://spectral-eu.checkpoint.com/latest/x/sh?dsn=$SPECTRAL_DSN' | sh"
      }
    }

    // Giai đoạn này chạy quét trên code của bạn
    stage('scan for issues') {
      steps {
        sh "$HOME/.spectral/spectral scan --ok  --include-tags base,audit"
      }
    }

    // Giai đoạn này là để build code (nếu bạn có)
    stage('build') {
      steps {
        // Ví dụ: sh "./build.sh"
        echo "Building your project..."
      }
    }
  }
}
