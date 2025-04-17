import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Render API Key and API URL
const RENDER_API_KEY = process.env.RENDER_API_KEY; // Ensure this is set in your environment
const RENDER_API_URL = "https://api.render.com/v1/services";

// Utility to extract GitHub repo details and get the default branch
async function getDefaultBranch(repoUrl) {
  try {
    const [_, user, repo] = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)(\.git)?/i) || [];
    const apiUrl = `https://api.github.com/repos/${user}/${repo}`;
    const res = await axios.get(apiUrl);
    return res.data.default_branch || "main";
  } catch (e) {
    console.error("Error fetching default branch:", e);
    return "main";  // fallback to 'main' if the branch cannot be determined
  }
}

// Utility to check if a file exists in the GitHub repo at the given branch
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

// POST request to start the deployment
app.post("/deploy", async (req, res) => {
  const { repoUrl, envVars } = req.body;

  // Basic validation for the GitHub repo URL
  if (!repoUrl || !repoUrl.startsWith("https://github.com/")) {
    return res.status(400).json({ error: "Invalid GitHub URL" });
  }

  // Extract repo name for service naming
  const repoParts = repoUrl.split("/");
  const repoName = repoParts[repoParts.length - 1].replace(/\.git$/, "");
  const serviceName = `app-${Math.floor(Math.random() * 99999)}-${repoName}`;
  const defaultBranch = await getDefaultBranch(repoUrl); // Get the default branch from GitHub

  let payload = {
    type: "web_service",
    name: serviceName,
    repo: repoUrl,
    branch: defaultBranch,
    plan: "starter" // You can adjust the plan as needed
  };

  // Check if required files are in the repo to determine project type
  const hasPackageJson = await repoHasFile(repoUrl, "package.json", defaultBranch);
  const hasRequirementsTxt = await repoHasFile(repoUrl, "requirements.txt", defaultBranch);
  const hasDockerfile = await repoHasFile(repoUrl, "Dockerfile", defaultBranch);

  // Determine the deployment type based on the repo's files
  if (hasDockerfile) {
    console.log("Using Docker deployment");
    payload.env = null;
  } else if (hasPackageJson) {
    console.log("Using Node.js deployment");
    payload.env = "node";
    payload.buildCommand = "npm install";
    payload.startCommand = "npm start";
  } else if (hasRequirementsTxt) {
    console.log("Using Python deployment");
    payload.env = "python";
    payload.buildCommand = "pip install -r requirements.txt";
    payload.startCommand = "python app.py";
  } else {
    return res.status(400).json({
      error: "Unsupported repo type",
      details: "Repo must contain a Dockerfile, package.json, or requirements.txt"
    });
  }

  // Add environment variables to the deployment payload
  if (envVars && Array.isArray(envVars)) {
    payload.envVars = envVars.map((env) => ({
      key: env.key,
      value: env.value
    }));
  }

  // Log the payload for debugging purposes
  console.log("Deployment payload:", JSON.stringify(payload, null, 2));

  try {
    // Send the request to Render's API to create the service
    const response = await axios.post(RENDER_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    // Successfully deployed, return the response
    res.json({
      message: "Deployment started!",
      serviceId: response.data.id,
      serviceName: response.data.name,
      dashboardLink: `https://dashboard.render.com/web/${response.data.id}`,
    });
  } catch (err) {
    // Log detailed error from Render's API
    console.error("Render API Error:", err.response?.data || err.message);
    res.status(500).json({
      error: "Deployment failed",
      details: err.response?.data || err.message,
    });
  }
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
