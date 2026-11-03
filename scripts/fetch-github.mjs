
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const USERNAME = "akshifan";

const token =
  process.env.GITHUB_TOKEN ||
  execSync("gh auth token", { encoding: "utf8" }).trim();

const query = `
{
  user(login: "${USERNAME}") {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}`;

const response = await fetch(
  "https://api.github.com/graphql",
  {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  }
);

if (!response.ok) {
  throw new Error(`GitHub API error: ${response.status}`);
}

const result = await response.json();

if (result.errors?.length) {
  throw new Error(JSON.stringify(result.errors));
}

const calendar =
  result.data.user.contributionsCollection.contributionCalendar;

const days = calendar.weeks.flatMap(
  week => week.contributionDays
);

const LEVEL = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const githubData = {
  username: USERNAME,
  start: days[0].date,
  total: calendar.totalContributions,
  counts: days.map(day => day.contributionCount),
  levels: days
    .map(day => LEVEL[day.contributionLevel])
    .join(""),
  dates: days.map(day => day.date),
};

mkdirSync("data", { recursive: true });

writeFileSync(
  "data/github.json",
  JSON.stringify(githubData, null, 2)
);

console.log("GitHub data generated successfully!");
console.log("Username:", USERNAME);
console.log("Total contributions:", githubData.total);
console.log("Days:", githubData.counts.length);
