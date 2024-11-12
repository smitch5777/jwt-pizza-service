const os = require("os");
const config = require("./config");

class MetricBuilder {
  constructor() {
    this.metrics = [];
  }

  addMetric(metricPrefix, metricName, metricValue, labels) {
    const labelsString = Object.entries(labels)
      .map(([key, value]) => `${key}=${value}`)
      .join(",");
    let metric;
    if (JSON.stringify(labels) != JSON.stringify({})) {
      metric = `${metricPrefix},source=${config.metrics.source},${labelsString} ${metricName}=${metricValue}`;
    } else {
      metric = `${metricPrefix},source=${config.metrics.source},${metricName}=${metricValue}`;
    }

    this.metrics.push(metric);
  }

  clearMetrics() {
    this.metrics = [];
  }

  toString(separator = "\n") {
    return this.metrics.join(separator);
  }
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

class Metrics {
  constructor() {
    this.totalRequests = 0;
    this.totalGets = 0;
    this.totalPuts = 0;
    this.totalPosts = 0;
    this.totalDeletes = 0;
    this.totalLatency = 0;
    this.latencies = [];

    this.totalAuthAttempts = 0;
    this.successfulAuthAttempts = 0;
    this.failedAuthAttempts = 0;

    this.totalPizzasSold = 0;
    this.totalRevenue = 0;
    this.totalCreationFailures = 0;
    this.creationLatencies = [];

    this.activeUsersCount = 0;

    this.sendMetricsPeriodically(10000);
  }

  requestTracker = (req, res, next) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      this.totalRequests++;

      switch (req.method) {
        case "GET":
          this.totalGets++;
          break;
        case "PUT":
          this.totalPuts++;
          break;
        case "POST":
          this.totalPosts++;
          break;
        case "DELETE":
          this.totalDeletes++;
          break;
      }

      this.totalLatency += duration;
      this.latencies.push(duration);

      if (req.path.includes("/auth")) {
        this.recordAuthAttempt(res.statusCode === 200);
        if (req.method == "PUT" && res.statusCode == 200) {
          this.activeUsersCount++;
        }
        if (req.method == "DELETE" && res.statusCode == 200) {
          this.activeUsersCount--;
        }
      }

      if (req.path.includes("/order") && req.method === "POST") {
        const { items } = req.body;
        const creationLatency = duration;
        const success = res.statusCode === 200;

        items.forEach((item) => {
          const price = item.price;
          this.recordPizzaSale(price, creationLatency, success);
        });
      }
    });

    next();
  };

  systemMetrics(buf) {
    const cpuUsage = getCpuUsagePercentage();
    const memoryUsage = getMemoryUsagePercentage();

    buf.addMetric("system", "cpu_usage_percentage", cpuUsage, {
      pizza: "cpu_usage",
    });
    buf.addMetric("system", "memory_usage_percentage", memoryUsage, {
      pizza: "memory_usage",
    });
  }

  authMetrics(buf) {
    buf.addMetric("auth", "auth_attempts_total", this.totalAuthAttempts, {
      pizza: "auth_attempts",
    });
    buf.addMetric(
      "auth",
      "auth_attempts_successful",
      this.successfulAuthAttempts,
      { pizza: "successful_auth" }
    );
    buf.addMetric("auth", "auth_attempts_failed", this.failedAuthAttempts, {
      pizza: "failed_auth",
    });
  }

  httpMetrics(buf) {
    const averageLatency =
      this.latencies.length > 0
        ? (this.totalLatency / this.latencies.length).toFixed(2)
        : 0;

    buf.addMetric("http", "request_total", this.totalRequests, {
      pizza: "total",
    });

    buf.addMetric("http", "request_total", this.totalGets, { method: "GET" });
    buf.addMetric("http", "request_total", this.totalPosts, { method: "POST" });
    buf.addMetric("http", "request_total", this.totalDeletes, {
      method: "DELETE",
    });

    buf.addMetric("user", "request_latency_average", averageLatency, {
      pizza: "latency",
    });

    this.latencies = [];
  }

  userMetrics(buf) {
    buf.addMetric("user", "active_users_total", this.activeUsersCount, {
      pizza: "active_users",
    });
  }

  purchaseMetrics(buf) {
    buf.addMetric("purchase", "pizzas_sold_total", this.totalPizzasSold, {
      pizza: "sold_total",
    });
    // buf.addMetric(
    //   "purchase",
    //   "pizzas_sold_minute",
    //   this.calculatePizzasSoldPerMinute(),
    //   { pizza: "sold_minute" }
    // );
    buf.addMetric("purchase", "revenue_total", this.totalRevenue, {
      pizza: "revenue_total",
    });
    // buf.addMetric(
    //   "purchase",
    //   "revenue_minute",
    //   this.calculateRevenuePerMinute(),
    //   { pizza: "revenue_minute" }
    // );
    buf.addMetric(
      "purchase",
      "creation_latency_average",
      this.calculateCreationLatencyAverage(),
      { pizza: "creation_latency" }
    );
    buf.addMetric(
      "purchase",
      "creation_failures_total",
      this.totalCreationFailures,
      { pizza: "creation_failures" }
    );
  }

  recordAuthAttempt(success) {
    this.totalAuthAttempts++;
    if (success) {
      this.successfulAuthAttempts++;
    } else {
      this.failedAuthAttempts++;
    }
  }
  calculateCreationLatencyAverage() {
    return this.creationLatencies.length > 0
      ? (
          this.creationLatencies.reduce((sum, latency) => sum + latency, 0) /
          this.creationLatencies.length
        ).toFixed(2)
      : 0;
  }

  recordPizzaSale(price, creationLatency, success) {
    this.totalPizzasSold++;
    this.totalRevenue += price;
    if (success) {
      this.creationLatencies.push(creationLatency);
    } else {
      this.totalCreationFailures++;
    }
  }

  sendMetricsPeriodically(period) {
    const timer = setInterval(() => {
      try {
        const buf = new MetricBuilder();
        this.httpMetrics(buf);
        this.systemMetrics(buf);
        this.userMetrics(buf);
        this.purchaseMetrics(buf);
        this.authMetrics(buf);
        buf.addMetric("http", "random_total_test", 10, { method: "GET" });

        const metrics = buf.toString("\n");
        this.sendMetricsToGrafana(metrics);
      } catch (error) {
        console.log("Error sending metrics", error);
      }
    }, period);

    timer.unref();
  }

  sendMetricsToGrafana(metrics) {
    console.log(metrics);
    fetch(`${config.metrics.url}`, {
      method: "POST",
      body: metrics,
      headers: {
        Authorization: `Bearer ${config.metrics.userId}:${config.metrics.apiKey}`,
      },
    })
      .then((response) => {
        console.log(JSON.stringify(response));
        if (!response.ok) {
          console.error("Failed to push metrics data to Grafana");
        } else {
          console.log(`Pushed ${metrics}`);
        }
      })
      .catch((error) => {
        console.error("Error pushing metrics:", error);
      });
  }
}

const metrics = new Metrics();
module.exports = metrics;
