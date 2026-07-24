# PAM SSH session gateway. Multi-stage: build a static Go binary, run as a
# non-root user on a distroless base with a read-only root filesystem. The
# container HEALTHCHECK invokes the binary's own `-healthcheck` mode (distroless
# has no shell/curl), which probes /healthz and exits 0/1.
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /pam-ssh-gateway .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /pam-ssh-gateway /pam-ssh-gateway
USER nonroot:nonroot
EXPOSE 4222
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/pam-ssh-gateway", "-healthcheck"]
ENTRYPOINT ["/pam-ssh-gateway"]
