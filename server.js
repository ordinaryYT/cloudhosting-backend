import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const RENDER_API_URL = "https://api.render.com/v1/services";

// Get the default branch of the repository (either 'main' or 'master')
async function getDefaultBranch(repoUrl) {
  try {
    const [_, user, repo] = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)(\.git)?/i) || [];
    const apiUrl = `https://api.github.com/repos/${user}/${repo}`;
    const res = await axios.get(apiUrl);
    return res.data.default_branch || "main";
  } catch (e) {
    return "main"; // fallback
  }
}

// Check if a specific file exists in the repository at the given branch
async function repoHasFile(repoUrl, fileName, branch = "main") {
  try {
    const [_, user, repo] = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)(\.git)?/i) || [];
    const url = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${fileName}`;
    const res = await axios.get(url);
    return res.status === 200;
  } catch {
    return false;
  }
}

app.post("/deploy", async (req, res) => {
  const { repoUrl } = req.body;

  if (!repoUrl || !repoUrl.startsWith("https://github.com/")) {
    return res.status(400).json({ error: "Invalid GitHub URL" });
  }

  const repoParts = repoUrl.split("/");
  const repoName = repoParts[repoParts.length - 1].replace(/\.git$/, "");
  const serviceName = `app-${Math.floor(Math.random() * 99999)}-${repoName}`;
  const defaultBranch = await getDefaultBranch(repoUrl);

  let payload = {
    type: "web_service",
    name: serviceName,
    repo: repoUrl,
    branch: defaultBranch,
    plan: "starter"
  };

  // Check if the repo contains key files to determine project type
  const hasPackageJson = await repoHasFile(repoUrl, "package.json", defaultBranch);
  const hasRequirementsTxt = await repoHasFile(repoUrl, "requirements.txt", defaultBranch);
  const hasDockerfile = await repoHasFile(repoUrl, "Dockerfile", defaultBranch);

  if (hasDockerfile) {
    // Handle Dockerized projects
    console.log("Using Docker deployment");
    payload.env = null;
  } else if (hasPackageJson) {
    // Handle Node.js projects
    console.log("Using Node.js deployment");
    payload.env = "node";
    payload.buildCommand = "npm install";
    payload.startCommand = "npm start";
  } else if (hasRequirementsTxt) {
    // Handle Python projects
    console.log("Using Python deployment");
    payload.env = "python";
    payload.buildCommand = "pip install -r requirements.txt";
    payload.startCommand = "python app.py";  // Adjust this if the entry point is different
  } else {
    return res.status(400).json({
      error: "Unsupported repo type",
      details: "Repo must contain a Dockerfile, package.json, or requirements.txt"
    });
  }

  try {
    const response = await axios.post(RENDER_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    res.json({
      message: "Deployment started!",
      serviceId: response.data.id,
      serviceName: response.data.name,
      dashboardLink: `https://dashboard.render.com/web/${response.data.id}`,
    });
  } catch (err) {
    console.error("RENDER ERROR:", err.response?.data || err.message);
    res.status(500).json({
      error: "Deployment failed",
      details: err.response?.data || err.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
