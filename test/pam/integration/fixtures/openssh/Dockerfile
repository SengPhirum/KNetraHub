# Disposable OpenSSH target for PAM integration tests. Password auth enabled;
# root/RootPass123 and pamuser/InitialPass123 (passwordless sudo) so tests can
# both open a session and change credentials. NOT for production use.
FROM alpine:3.20
RUN apk add --no-cache openssh sudo bash shadow \
 && ssh-keygen -A \
 && adduser -D -s /bin/bash pamuser \
 && echo 'pamuser:InitialPass123' | chpasswd \
 && echo 'root:RootPass123' | chpasswd \
 && echo 'pamuser ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers \
 && sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config \
 && sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
