export type CreateCustomerPayload = {
  tempId: string;
  name: string;
  phone?: string;
};

type MockResponse<T> = {
  ok: boolean;
  status: number;
  json: () => Promise<T>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const makeServerId = () => `srv_${Math.random().toString(16).slice(2, 10)}`;

const mockFetch = async (input: string, init?: RequestInit): Promise<MockResponse<any>> => {
  void input;
  void init;
  const latency = 200 + Math.floor(Math.random() * 800);
  await sleep(latency);
  const shouldFail = Math.random() < 0.2;
  if (shouldFail) {
    return {
      ok: false,
      status: 500,
      json: async () => ({ message: "mock_error" }),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: makeServerId() }),
  };
};

export const postCustomer = async (payload: CreateCustomerPayload) => {
  const response = await mockFetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data?.message ? String(data.message) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return response.json() as Promise<{ id: string }>;
};
