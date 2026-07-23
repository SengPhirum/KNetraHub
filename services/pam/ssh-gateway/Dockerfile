# PAM SSH session gateway. Multi-stage: build a static Go binary, run as a
# non-root user on a minimal base with a read-only root filesystem.
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download 2>/dev/null || true
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /pam-ssh-gateway .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /pam-ssh-gateway /pam-ssh-gateway
USER nonroot:nonroot
EXPOSE 4222
ENTRYPOINT ["/pam-ssh-gateway"]
