const fs = require('fs');
const path = require('path');

/**
 * 이 스크립트는 Playwright 테스트 결과 요약 파일을 읽어
 * GitHub 이슈 본문과 Actions Summary에 사용할 마크다운을 생성합니다.
 */

// --- 경로 설정 ---
// Playwright 테스트가 생성하는 요약 JSON 파일의 경로
const summaryJsonPath = path.join(process.cwd(), 'test-results', 'summary.json');
// 생성될 이슈 본문 파일의 경로
const issueBodyPath = path.join(process.cwd(), 'issue-body.md');
// GitHub Actions의 Step Summary 파일 경로 (환경 변수에서 가져옴)
const githubSummaryPath = process.env.GITHUB_STEP_SUMMARY;

// --- 메인 로직 ---
try {
  // 1. 요약 파일 존재 여부 확인
  if (!fs.existsSync(summaryJsonPath)) {
    console.error(`오류: 테스트 요약 파일(${summaryJsonPath})을 찾을 수 없습니다.`);
    const errorMessage = '## 🚨 테스트 실행 오류\n\nPlaywright 테스트 실행 중 심각한 오류가 발생하여 결과 요약 파일을 생성하지 못했습니다. Actions 로그를 직접 확인해주세요.';
    // 이슈 본문 파일 생성
    fs.writeFileSync(issueBodyPath, errorMessage);
    // GitHub Step Summary에 오류 메시지 추가
    if (githubSummaryPath) {
      fs.appendFileSync(githubSummaryPath, errorMessage + '\n');
    }
    process.exit(1); // 오류가 있음을 명시적으로 알림
  }

  // 2. 요약 파일 읽기 및 분석
  const results = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf-8'));
  const total = results.length;
  const failures = results.filter(r => r.status === 'failure');
  const successCount = total - failures.length;
  const successRate = total > 0 ? (successCount / total * 100).toFixed(2) : '100.00';

  // 3. 마크다운 본문 생성
  let summaryMarkdown = `## E2E 테스트 결과 요약\n\n`;
  summaryMarkdown += `- **총 LOT 수:** ${total}개\n`;
  summaryMarkdown += `- **성공:** ${successCount}개\n`;
  summaryMarkdown += `- **실패:** ${failures.length}개\n`;
  summaryMarkdown += `- **성공률:** ${successRate}%\n\n`;

  // 4. 실패 항목이 있을 경우 상세 내역 추가
  if (failures.length > 0) {
    summaryMarkdown += '### 실패 항목 상세\n\n';
    summaryMarkdown += '| 제품명 | LOT 번호 | 실패 사유 |\n';
    summaryMarkdown += '|---|---|---|\n';
    failures.forEach(f => {
      // 오류 메시지 정리: 줄바꿈 제거, ANSI 색상 코드 제거, 마크다운 테이블 깨짐 방지
      const errorMsg = f.error
        .replace(/\r?\n/g, ' ')
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/\|/g, '&#124;') // 파이프(|) 문자가 테이블을 깨뜨리는 것을 방지
        .trim();
      summaryMarkdown += `| ${f.productName} | ${f.lotNumber} | ${errorMsg} |\n`;
    });
  }

  // 5. 결과 파일 쓰기
  // 실패했을 때만 이슈 본문 파일을 생성합니다.
  if (failures.length > 0) {
    fs.writeFileSync(issueBodyPath, summaryMarkdown);
    console.log(`실패 내역을 ${issueBodyPath} 파일에 저장했습니다.`);
  }

  // GitHub Step Summary에는 항상 결과를 기록합니다.
  if (githubSummaryPath) {
    fs.appendFileSync(githubSummaryPath, summaryMarkdown);
    console.log('GitHub Actions Step Summary를 업데이트했습니다.');
  }

  console.log('요약 생성 완료.');

} catch (error) {
  console.error('스크립트 실행 중 예외가 발생했습니다:', error);
  const errorMessage = `## 🚨 스크립트 실행 오류\n\n이슈 본문 생성 스크립트 실행 중 오류가 발생했습니다.\n\n\`\`\`\n${error.message}\n\`\`\``;
  fs.writeFileSync(issueBodyPath, errorMessage);
  if (githubSummaryPath) {
    fs.appendFileSync(githubSummaryPath, errorMessage + '\n');
  }
  process.exit(1);
}
